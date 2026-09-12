-- SENGA Business: commerce type for restaurant / supermarket / pharmacy / boutique partners.

CREATE TYPE "CommerceType" AS ENUM ('RESTAURANT', 'SUPERMARKET', 'PHARMACY', 'BOUTIQUE');

ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "commerceType" "CommerceType" NOT NULL DEFAULT 'RESTAURANT';

CREATE INDEX IF NOT EXISTS "restaurants_commerceType_idx" ON "restaurants"("commerceType");
