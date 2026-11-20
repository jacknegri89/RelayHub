BEGIN;

ALTER TABLE "DestinationIncident" ADD COLUMN "openedOrder" BIGINT, ADD COLUMN "resolvedOrder" BIGINT;
CREATE SEQUENCE "DestinationIncident_openedOrder_seq" AS BIGINT OWNED BY "DestinationIncident"."openedOrder";

-- Order retained transitions by observation time. At the same millisecond a
-- destination's previous episode must close before its next one opens. For
-- otherwise indistinguishable completed episodes, use the retained attempt's
-- start time when available, then its UUID to keep the reconstruction stable.
WITH ordered AS (
    SELECT incident.id, transition.is_recovery,
        row_number() OVER (ORDER BY transition.observed_at, incident."destinationId",
            incident."openedAt", incident."resolvedAt" NULLS LAST,
            attempt."startedAt" NULLS LAST, incident.id, transition.is_recovery) AS position
    FROM "DestinationIncident" incident
    LEFT JOIN "DeliveryAttempt" attempt ON attempt.id = incident.id
    CROSS JOIN LATERAL (VALUES (incident."openedAt", false), (incident."resolvedAt", true))
        AS transition(observed_at, is_recovery)
    WHERE transition.observed_at IS NOT NULL
), by_incident AS (
    SELECT id, max(position) FILTER (WHERE NOT is_recovery) AS opening,
        max(position) FILTER (WHERE is_recovery) AS recovery
    FROM ordered GROUP BY id
)
UPDATE "DestinationIncident" incident SET "openedOrder" = history.opening, "resolvedOrder" = history.recovery
FROM by_incident history WHERE incident.id = history.id;

SELECT setval('"DestinationIncident_openedOrder_seq"', COALESCE(max(GREATEST("openedOrder", "resolvedOrder")), 1), count(*) > 0)
FROM "DestinationIncident";

ALTER TABLE "DestinationIncident"
    ALTER COLUMN "openedOrder" SET NOT NULL,
    ALTER COLUMN "openedOrder" SET DEFAULT nextval('"DestinationIncident_openedOrder_seq"'),
    ADD CONSTRAINT "DestinationIncident_transition_order_check"
        CHECK (("resolvedAt" IS NULL) = ("resolvedOrder" IS NULL) AND ("resolvedOrder" IS NULL OR "resolvedOrder" > "openedOrder"));

-- Legacy workers continue using the existing attempt trigger. Both timestamps
-- use the same sequence while its caller still holds the destination row lock.
CREATE FUNCTION relayhub_order_recovery() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' OR OLD."resolvedAt" IS NULL THEN
        NEW."resolvedOrder" := nextval('"DestinationIncident_openedOrder_seq"');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER relayhub_order_recovery
BEFORE INSERT OR UPDATE OF "resolvedAt" ON "DestinationIncident"
FOR EACH ROW WHEN (NEW."resolvedAt" IS NOT NULL)
EXECUTE FUNCTION relayhub_order_recovery();

CREATE INDEX "DestinationIncident_resolvedAt_idx" ON "DestinationIncident" ("resolvedAt");
CREATE INDEX "DestinationIncident_organizationId_openedAt_openedOrder_idx"
    ON "DestinationIncident" ("organizationId", "openedAt", "openedOrder");
CREATE INDEX "DestinationIncident_organizationId_resolvedAt_resolvedOrder_idx"
    ON "DestinationIncident" ("organizationId", "resolvedAt", "resolvedOrder");
COMMIT;
