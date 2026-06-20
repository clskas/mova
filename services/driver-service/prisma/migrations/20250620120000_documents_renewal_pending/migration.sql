ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "documentsRenewalPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "documentsRenewalRequestedAt" TIMESTAMP(3);
