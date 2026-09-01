-- AlterTable
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "activationPinExpiresAt" TIMESTAMP(3);
