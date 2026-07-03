-- Codes promo partenaires : périmètre, propriétaire, répartition remise
CREATE TYPE "PromoOwnerType" AS ENUM ('PLATFORM', 'RESTAURANT', 'RENTAL_OWNER');
CREATE TYPE "PromoScope" AS ENUM ('ALL_PASSENGER_SERVICES', 'FOOD_MENU_ONLY', 'FOOD_ORDER', 'RENTAL_SUBTOTAL');
CREATE TYPE "PromoAbsorbedBy" AS ENUM ('PLATFORM', 'PARTNER', 'SHARED');

ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "ownerType" "PromoOwnerType" NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "scope" "PromoScope" NOT NULL DEFAULT 'ALL_PASSENGER_SERVICES';
ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "absorbedBy" "PromoAbsorbedBy" NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "partnerAbsorbPercent" INTEGER;
ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "rentalOwnerUserId" TEXT;

CREATE INDEX IF NOT EXISTS "promo_codes_restaurantId_idx" ON "promo_codes"("restaurantId");
CREATE INDEX IF NOT EXISTS "promo_codes_rentalOwnerUserId_idx" ON "promo_codes"("rentalOwnerUserId");

ALTER TABLE "promo_codes" DROP CONSTRAINT IF EXISTS "promo_codes_restaurantId_fkey";
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "promo_codes" SET "ownerType" = 'PLATFORM', "scope" = 'ALL_PASSENGER_SERVICES', "absorbedBy" = 'PLATFORM'
WHERE "restaurantId" IS NULL AND "rentalOwnerUserId" IS NULL;
