-- AlterEnum
ALTER TYPE "RentalInquiryStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "RentalInquiryStatus" ADD VALUE IF NOT EXISTS 'RETURNED';

-- AlterTable rental_vehicles
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "make" TEXT;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "year" INTEGER;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "transmission" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT 'Kinshasa';
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "weeklyDiscountPct" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.5;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "ownerName" TEXT;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "ownerBadge" TEXT;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "ownerContactPhone" TEXT;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "features" JSONB;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "cancellationPolicy" TEXT;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "mileageUnlimited" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "limitedMileageFeeCdf" INTEGER NOT NULL DEFAULT 15000;

-- AlterTable rental_inquiries
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "pickupCity" TEXT;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "returnCity" TEXT;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "rentalPeriod" TEXT NOT NULL DEFAULT 'DAILY';
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "mileageType" TEXT NOT NULL DEFAULT 'UNLIMITED';
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "insuranceTier" TEXT NOT NULL DEFAULT 'BASIC';
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "addOns" JSONB;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "totalCdf" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "rental_vehicles_city_category_isActive_idx" ON "rental_vehicles"("city", "category", "isActive");
