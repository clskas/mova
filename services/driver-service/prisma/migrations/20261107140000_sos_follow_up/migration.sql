-- SOS follow-up: acknowledgement, escalation, live trail, ops notes, emergency contacts
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "acknowledgedBy" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "acknowledgedByName" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "trail" JSONB;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "lastLocationAt" TIMESTAMP(3);
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "notes" JSONB;
CREATE INDEX IF NOT EXISTS "incidents_userId_createdAt_idx" ON "incidents"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "incidents_status_isEmergency_acknowledgedAt_idx" ON "incidents"("status", "isEmergency", "acknowledgedAt");

CREATE TABLE IF NOT EXISTS "trusted_contacts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trusted_contacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "trusted_contacts_userId_idx" ON "trusted_contacts"("userId");
