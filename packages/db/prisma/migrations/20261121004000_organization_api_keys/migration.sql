CREATE TABLE "OrganizationApiKey" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name TEXT NOT NULL,
  digest TEXT NOT NULL CHECK (length(digest) = 64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "OrganizationApiKey_digest_key" ON "OrganizationApiKey"(digest);
CREATE INDEX "OrganizationApiKey_organizationId_createdAt_idx" ON "OrganizationApiKey"("organizationId","createdAt");
