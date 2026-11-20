BEGIN;

-- Old and new workers both finalize attempts through this table.
LOCK TABLE "DeliveryAttempt" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "WebhookDestination" ADD COLUMN "failureStreakId" TEXT;
ALTER TABLE "DestinationIncident" ADD COLUMN "failureStreakId" TEXT;
ALTER TABLE "DeliveryAttempt" ADD COLUMN "failureStreakId" TEXT;

-- Historical attempts have timestamps, but no serialized observation order.
-- Require the retained run to match its original opening attempt and count.
-- A mixed same-millisecond boundary or missing evidence leaves only the
-- independently provable opening attempt available for that incident.
CREATE TEMP TABLE relayhub_retained_failures ON COMMIT DROP AS
WITH observed AS (
    SELECT a.id, d."destinationId", a."finishedAt", a."startedAt",
        COALESCE(a."httpStatus" BETWEEN 200 AND 299, false) AS success
    FROM "DeliveryAttempt" a JOIN "Delivery" d ON d.id = a."deliveryId"
    WHERE a."finishedAt" IS NOT NULL AND (
        (a.outcome IN ('success','retry','http_error') AND a."httpStatus" BETWEEN 100 AND 599)
        OR (a.outcome = 'retry' AND a."httpStatus" IS NULL AND a."durationMs" >= 0)
    )
), ordered AS (
    SELECT observed.*,
        count(*) FILTER (WHERE success) OVER (PARTITION BY "destinationId"
            ORDER BY "finishedAt", "startedAt", id ROWS UNBOUNDED PRECEDING) AS run,
        count(*) FILTER (WHERE success) OVER (PARTITION BY "destinationId") AS final_run,
        bool_or(success) OVER (PARTITION BY "destinationId", "finishedAt") AS touches_success
    FROM observed
), failures AS (
    SELECT ordered.*, i.id AS opening,
        row_number() OVER w AS position,
        first_value(ordered.id) OVER w AS first_id
    FROM ordered LEFT JOIN "DestinationIncident" i ON i.id = ordered.id
    WHERE NOT success
    WINDOW w AS (PARTITION BY ordered."destinationId", run ORDER BY "finishedAt", "startedAt", ordered.id)
)
SELECT failures.*, count(*) OVER w AS run_size, count(opening) OVER w AS openings,
    max(opening) FILTER (WHERE position = 3) OVER w AS incident,
    bool_or(touches_success) OVER w AS ambiguous
FROM failures WINDOW w AS (PARTITION BY "destinationId", run);

UPDATE "DestinationIncident" SET "failureStreakId" = id;
UPDATE "DeliveryAttempt" a SET "failureStreakId" = i.id FROM "DestinationIncident" i WHERE a.id = i.id;
UPDATE "DeliveryAttempt" a SET "failureStreakId" = i.id
FROM relayhub_retained_failures f JOIN "DestinationIncident" i ON i.id = f.incident
WHERE a.id = f.id AND f.openings = 1 AND NOT f.ambiguous AND f.run_size = i."failureCount";

-- Continue an ongoing failure run across the upgrade, including a run with
-- only one or two failures that has not yet opened an incident.
UPDATE "WebhookDestination" d SET "failureStreakId" = i.id
FROM "DestinationIncident" i WHERE i."destinationId" = d.id AND i."resolvedAt" IS NULL;
UPDATE "DeliveryAttempt" a SET "failureStreakId" = f.first_id
FROM relayhub_retained_failures f JOIN "WebhookDestination" d ON d.id = f."destinationId"
WHERE a.id = f.id AND f.run = f.final_run AND NOT f.ambiguous AND f.openings = 0
    AND f.run_size = d."consecutiveFailures" AND d."consecutiveFailures" BETWEEN 1 AND 2;
UPDATE "WebhookDestination" d SET "failureStreakId" = f.first_id
FROM relayhub_retained_failures f WHERE d.id = f."destinationId" AND f.run = f.final_run
    AND f.position = 1 AND NOT f.ambiguous AND f.openings = 0 AND f.run_size = d."consecutiveFailures"
    AND d."consecutiveFailures" BETWEEN 1 AND 2;
UPDATE "WebhookDestination" SET "failureStreakId" = 'legacy-' || id
WHERE "consecutiveFailures" > 0 AND "failureStreakId" IS NULL;

-- Reuse the health projection's classification and serialization instead of
-- identifying incidents later from potentially identical or reordered timestamps.
CREATE OR REPLACE FUNCTION relayhub_attempt_finished() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    target_id TEXT;
    tenant_id TEXT;
    previous_count INTEGER;
    current_count INTEGER;
    group_id TEXT;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD."finishedAt" IS NOT NULL THEN
        RETURN NULL;
    END IF;
    SELECT "destinationId", "organizationId" INTO STRICT target_id, tenant_id
    FROM "Delivery" WHERE id = NEW."deliveryId";
    SELECT "consecutiveFailures", "failureStreakId" INTO STRICT previous_count, group_id
    FROM "WebhookDestination" WHERE id = target_id AND "organizationId" = tenant_id FOR UPDATE;
    PERFORM relayhub_observe_attempt(target_id, tenant_id, NEW);
    SELECT "consecutiveFailures" INTO STRICT current_count FROM "WebhookDestination" WHERE id = target_id;
    IF current_count > previous_count THEN
        IF previous_count = 0 THEN
            group_id := NEW.id;
            UPDATE "WebhookDestination" SET "failureStreakId" = group_id WHERE id = target_id;
        END IF;
        UPDATE "DeliveryAttempt" SET "failureStreakId" = group_id WHERE id = NEW.id;
        -- If this observation opened an incident, its ID is the attempt ID.
        UPDATE "DestinationIncident" SET "failureStreakId" = group_id WHERE id = NEW.id;
    ELSIF current_count = 0 AND previous_count > 0 THEN
        UPDATE "WebhookDestination" SET "failureStreakId" = NULL WHERE id = target_id;
    END IF;
    RETURN NULL;
END;
$$;
CREATE INDEX "DeliveryAttempt_failureStreakId_deliveryId_idx" ON "DeliveryAttempt" ("failureStreakId","deliveryId");
COMMIT;
