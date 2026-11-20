DROP INDEX "WebhookEvent_sourceId_ingressSignature_key";
ALTER TABLE "WebhookEvent" DROP COLUMN "ingressSignature";
CREATE TABLE "IngressReceipt" (
    "sourceId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IngressReceipt_pkey" PRIMARY KEY ("sourceId", "signature")
);
CREATE INDEX "IngressReceipt_expiresAt_idx" ON "IngressReceipt"("expiresAt");
ALTER TABLE "IngressReceipt" ADD CONSTRAINT "IngressReceipt_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "WebhookSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
