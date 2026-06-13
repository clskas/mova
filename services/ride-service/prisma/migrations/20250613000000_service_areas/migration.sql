-- Multi-city service areas: communes composite unique + pricing by city

-- Drop old unique constraints
ALTER TABLE "communes" DROP CONSTRAINT IF EXISTS "communes_name_key";
ALTER TABLE "pricing_rules" DROP CONSTRAINT IF EXISTS "pricing_rules_vehicleType_key";

-- Add city column default already exists on communes; ensure pricing has city
ALTER TABLE "pricing_rules" ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT 'Kinshasa';

-- Composite uniques
CREATE UNIQUE INDEX IF NOT EXISTS "communes_name_city_key" ON "communes"("name", "city");
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_rules_vehicleType_city_key" ON "pricing_rules"("vehicleType", "city");
