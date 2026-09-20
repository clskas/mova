-- AlterTable
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "fiscalStickerExpiry" TIMESTAMP(3);
