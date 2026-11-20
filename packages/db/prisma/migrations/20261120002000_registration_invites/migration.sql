CREATE TABLE "RegistrationInvite" (
    "digest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    CONSTRAINT "RegistrationInvite_pkey" PRIMARY KEY ("digest")
);

CREATE INDEX "RegistrationInvite_expiresAt_idx" ON "RegistrationInvite"("expiresAt");
