BEGIN;

CREATE TABLE "DestinationEmailSubscription" (
    id TEXT PRIMARY KEY, "destinationId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL, email TEXT NOT NULL, locale TEXT NOT NULL CHECK (locale IN ('en','it')),
    "verifiedAt" TIMESTAMP(3), "challengeExpiresAt" TIMESTAMP(3), "failedChecks" INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY ("destinationId","organizationId") REFERENCES "WebhookDestination"(id,"organizationId") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("organizationId","userId") REFERENCES "OrganizationMember"("organizationId","userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DestinationEmailSubscription_destinationId_userId_key" ON "DestinationEmailSubscription"("destinationId","userId");
CREATE INDEX "DestinationEmailSubscription_organizationId_userId_idx" ON "DestinationEmailSubscription"("organizationId","userId");
CREATE INDEX "DestinationEmailSubscription_challengeExpiresAt_idx" ON "DestinationEmailSubscription"("challengeExpiresAt");

CREATE TABLE "DestinationEmailMessage" (
    id BIGSERIAL PRIMARY KEY, "subscriptionId" TEXT NOT NULL REFERENCES "DestinationEmailSubscription"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "eventKey" TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('confirmation','outage','recovery')),
    "destinationName" TEXT NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "firstAttemptAt" TIMESTAMP(3),
    attempts INTEGER NOT NULL DEFAULT 0, "finishedAt" TIMESTAMP(3), failed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX "DestinationEmailMessage_subscriptionId_eventKey_key" ON "DestinationEmailMessage"("subscriptionId","eventKey");
CREATE INDEX "DestinationEmailMessage_finishedAt_nextAttemptAt_idx" ON "DestinationEmailMessage"("finishedAt","nextAttemptAt");

-- Capture the audience at transition time, in the same transaction as the completed attempt.
CREATE FUNCTION relayhub_enqueue_incident_email() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    transition TEXT := 'outage';
    observed TIMESTAMP(3) := NEW."openedAt";
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD."resolvedAt" IS NOT NULL OR NEW."resolvedAt" IS NULL THEN
            RETURN NULL;
        END IF;
        transition := 'recovery';
        observed := NEW."resolvedAt";
    END IF;
    INSERT INTO "DestinationEmailMessage" ("subscriptionId","eventKey",kind,"destinationName","occurredAt")
    SELECT s.id, transition || '/' || NEW.id, transition, d.name, observed
    FROM "DestinationEmailSubscription" s
    JOIN "WebhookDestination" d ON (d.id,d."organizationId")=(s."destinationId",s."organizationId")
    JOIN "User" u ON u.id=s."userId" AND u.email=s.email
    WHERE s."destinationId"=NEW."destinationId" AND s."organizationId"=NEW."organizationId" AND s."verifiedAt" IS NOT NULL
    ON CONFLICT ("subscriptionId","eventKey") DO NOTHING;
    RETURN NULL;
END;
$$;
CREATE TRIGGER relayhub_incident_email AFTER INSERT OR UPDATE OF "resolvedAt" ON "DestinationIncident"
FOR EACH ROW EXECUTE FUNCTION relayhub_enqueue_incident_email();

CREATE FUNCTION relayhub_clear_old_mailbox() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM "DestinationEmailSubscription" WHERE "userId"=NEW.id AND email IS DISTINCT FROM NEW.email;
    RETURN NULL;
END;
$$;
CREATE TRIGGER relayhub_mailbox_changed AFTER UPDATE OF email ON "User"
FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email) EXECUTE FUNCTION relayhub_clear_old_mailbox();
COMMIT;
