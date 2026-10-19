-- Stop defaulting every new driver to Kinshasa (inflated admin city counts).
ALTER TABLE "driver_profiles" ALTER COLUMN "operatingCity" DROP DEFAULT;
ALTER TABLE "driver_profiles" ALTER COLUMN "operatingCity" DROP NOT NULL;

-- Clear false Kinshasa labels when the driver never sent GPS (pure schema default).
UPDATE "driver_profiles"
SET "operatingCity" = NULL
WHERE "operatingCity" IS NOT NULL
  AND LOWER(TRIM("operatingCity")) = 'kinshasa'
  AND ("currentLat" IS NULL OR "currentLng" IS NULL);
