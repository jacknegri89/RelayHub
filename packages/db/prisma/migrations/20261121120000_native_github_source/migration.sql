CREATE TYPE "SourceProvider" AS ENUM ('relayhub', 'github');

ALTER TABLE "WebhookSource"
    ADD COLUMN "provider" "SourceProvider" NOT NULL DEFAULT 'relayhub';
