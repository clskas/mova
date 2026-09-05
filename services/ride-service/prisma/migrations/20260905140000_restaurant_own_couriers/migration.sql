-- Restaurant fleet + meal escrow milestones (credit resto at pickup, courier at PIN).

CREATE TYPE "RestaurantCourierMode" AS ENUM ('PLATFORM', 'OWN', 'HYBRID');
CREATE TYPE "DeliveryCourierSource" AS ENUM ('PLATFORM', 'RESTAURANT');

ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "courierMode" "RestaurantCourierMode" NOT NULL DEFAULT 'PLATFORM';

CREATE TABLE IF NOT EXISTS "restaurant_drivers" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "driverUserId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_drivers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_drivers_restaurantId_driverUserId_key"
  ON "restaurant_drivers"("restaurantId", "driverUserId");
CREATE INDEX IF NOT EXISTS "restaurant_drivers_driverUserId_idx"
  ON "restaurant_drivers"("driverUserId");

ALTER TABLE "restaurant_drivers"
  DROP CONSTRAINT IF EXISTS "restaurant_drivers_restaurantId_fkey";
ALTER TABLE "restaurant_drivers"
  ADD CONSTRAINT "restaurant_drivers_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "courierSource" "DeliveryCourierSource",
  ADD COLUMN IF NOT EXISTS "restaurantCreditedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstUnreachableAt" TIMESTAMP(3);
