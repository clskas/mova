-- Partner suite: hours/pause/stock, reviews reply, rental payout/check-in/deposit/blocks, promo happy hour

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "openingHours" JSONB;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "pausedUntil" TIMESTAMP(3);
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "stockAlertThreshold" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "delivery_ratings" ADD COLUMN IF NOT EXISTS "partnerReply" TEXT;
ALTER TABLE "delivery_ratings" ADD COLUMN IF NOT EXISTS "partnerRepliedAt" TIMESTAMP(3);

ALTER TABLE "rental_partner_profiles" ADD COLUMN IF NOT EXISTS "payoutProvider" TEXT;
ALTER TABLE "rental_partner_profiles" ADD COLUMN IF NOT EXISTS "payoutPhone" TEXT;

DO $$ BEGIN
  CREATE TYPE "RentalDepositStatus" AS ENUM ('NONE', 'HELD', 'RELEASED', 'PARTIAL', 'DISPUTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "checkInAt" TIMESTAMP(3);
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "checkOutAt" TIMESTAMP(3);
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "checkInKm" INTEGER;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "checkOutKm" INTEGER;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "checkInPhotos" JSONB;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "checkOutPhotos" JSONB;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "checkInSignature" TEXT;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "checkOutSignature" TEXT;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "depositStatus" "RentalDepositStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "depositHeldCdf" INTEGER;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "depositNote" TEXT;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "movaDriverRequestedAt" TIMESTAMP(3);

ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "happyHourStartMin" INTEGER;
ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "happyHourEndMin" INTEGER;

CREATE TABLE IF NOT EXISTS "vehicle_blocks" (
  "id" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vehicle_blocks_vehicleId_startDate_endDate_idx"
  ON "vehicle_blocks"("vehicleId", "startDate", "endDate");

DO $$ BEGIN
  ALTER TABLE "vehicle_blocks"
    ADD CONSTRAINT "vehicle_blocks_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "rental_vehicles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
