BEGIN;

ALTER TABLE "WebhookDestination"
    ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastHealthObservationAt" TIMESTAMP(3);

CREATE TABLE "DestinationDailyStat" (
    "destinationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "responseDurationMs" BIGINT NOT NULL DEFAULT 0,
    "responseCount" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("destinationId", "day"),
    FOREIGN KEY ("destinationId", "organizationId") REFERENCES "WebhookDestination" ("id", "organizationId")
        ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DestinationDailyStat_organizationId_day_idx" ON "DestinationDailyStat" ("organizationId", "day");
CREATE INDEX "DestinationDailyStat_day_idx" ON "DestinationDailyStat" ("day");

CREATE TABLE "DestinationIncident" (
    "id" TEXT PRIMARY KEY,
    "destinationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL CHECK ("failureCount" >= 3),
    CHECK ("resolvedAt" >= "openedAt"),
    FOREIGN KEY ("destinationId", "organizationId") REFERENCES "WebhookDestination" ("id", "organizationId")
        ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DestinationIncident_one_open" ON "DestinationIncident" ("destinationId") WHERE "resolvedAt" IS NULL;
CREATE INDEX "DestinationIncident_organizationId_resolvedAt_openedAt_idx" ON "DestinationIncident" ("organizationId", "resolvedAt", "openedAt");
CREATE INDEX "DestinationIncident_destinationId_openedAt_idx" ON "DestinationIncident" ("destinationId", "openedAt");

CREATE FUNCTION relayhub_observe_attempt(
    target_id TEXT, tenant_id TEXT, attempt "DeliveryAttempt"
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    incident_threshold CONSTANT INTEGER := 3;
    today_utc CONSTANT DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE;
    observation_day DATE := attempt."finishedAt"::DATE;
    observed_at TIMESTAMP(3);
    successes INTEGER := 0;
    streak INTEGER;
    response_ms INTEGER;
BEGIN
    -- The existing worker times send(), including DNS and connection errors.
    -- A retry before send() has no duration. Local failures never reflect endpoint health.
    IF attempt.outcome IN ('success', 'retry', 'http_error') AND attempt."httpStatus" BETWEEN 100 AND 599 THEN
        successes := (attempt."httpStatus" BETWEEN 200 AND 299)::INTEGER;
        IF attempt."durationMs" >= 0 THEN
            response_ms := attempt."durationMs";
        END IF;
    ELSIF attempt.outcome = 'retry' AND attempt."httpStatus" IS NULL AND attempt."durationMs" >= 0 THEN
        successes := 0;
    ELSE
        RETURN;
    END IF;

    -- The destination row serializes observations from different deliveries. A worker
    -- can have captured its timestamp before another worker obtained this lock.
    UPDATE "WebhookDestination" SET
        "lastHealthObservationAt" = GREATEST("lastHealthObservationAt", attempt."finishedAt"),
        "consecutiveFailures" = CASE WHEN successes = 1 THEN 0 ELSE "consecutiveFailures" + 1 END
    WHERE "id" = target_id AND "organizationId" = tenant_id
    RETURNING "consecutiveFailures", "lastHealthObservationAt" INTO STRICT streak, observed_at;

    IF streak = incident_threshold THEN
        INSERT INTO "DestinationIncident" ("id", "destinationId", "organizationId", "openedAt", "failureCount")
        VALUES (attempt.id, target_id, tenant_id, observed_at, streak);
    ELSIF streak > incident_threshold THEN
        UPDATE "DestinationIncident" SET "failureCount" = streak
        WHERE "destinationId" = target_id AND "organizationId" = tenant_id AND "resolvedAt" IS NULL;
    ELSIF streak = 0 THEN
        UPDATE "DestinationIncident" SET "resolvedAt" = observed_at
        WHERE "destinationId" = target_id AND "organizationId" = tenant_id AND "resolvedAt" IS NULL;
    END IF;

    IF observation_day BETWEEN today_utc - 6 AND today_utc THEN
        INSERT INTO "DestinationDailyStat" AS stats
            ("destinationId", "organizationId", "day", "successCount", "failureCount", "responseDurationMs", "responseCount")
        VALUES (target_id, tenant_id, observation_day, successes, 1 - successes, COALESCE(response_ms, 0), (response_ms IS NOT NULL)::INTEGER)
        ON CONFLICT ("destinationId", "day") DO UPDATE SET
            "successCount" = stats."successCount" + EXCLUDED."successCount",
            "failureCount" = stats."failureCount" + EXCLUDED."failureCount",
            "responseDurationMs" = stats."responseDurationMs" + EXCLUDED."responseDurationMs",
            "responseCount" = stats."responseCount" + EXCLUDED."responseCount";
    END IF;
END;
$$;

CREATE FUNCTION relayhub_attempt_finished() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    target_id TEXT;
    tenant_id TEXT;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD."finishedAt" IS NOT NULL THEN
        RETURN NULL;
    END IF;
    SELECT "destinationId", "organizationId" INTO STRICT target_id, tenant_id
    FROM "Delivery" WHERE "id" = NEW."deliveryId";
    PERFORM relayhub_observe_attempt(target_id, tenant_id, NEW);
    RETURN NULL;
END;
$$;

-- The trigger's table lock protects this snapshot until commit. Older workers
-- resume through the same trigger after the retained attempts are replayed.
CREATE TRIGGER relayhub_attempt_finished
AFTER INSERT OR UPDATE OF "finishedAt" ON "DeliveryAttempt"
FOR EACH ROW WHEN (NEW."finishedAt" IS NOT NULL)
EXECUTE FUNCTION relayhub_attempt_finished();

DO $$
DECLARE
    entry RECORD;
BEGIN
    FOR entry IN
        SELECT delivery."destinationId", delivery."organizationId", attempt
        FROM "DeliveryAttempt" attempt JOIN "Delivery" delivery ON delivery."id" = attempt."deliveryId"
        WHERE attempt."finishedAt" IS NOT NULL
        ORDER BY delivery."destinationId", attempt."finishedAt", attempt."startedAt", attempt.id
    LOOP
        PERFORM relayhub_observe_attempt(entry."destinationId", entry."organizationId", entry.attempt);
    END LOOP;
END;
$$;

COMMIT;
