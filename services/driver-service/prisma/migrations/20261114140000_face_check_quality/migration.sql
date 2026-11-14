ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "faceCheckedAt" TIMESTAMP(3);
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "qualityBlockedAt" TIMESTAMP(3);
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "qualityBlockReason" TEXT;
