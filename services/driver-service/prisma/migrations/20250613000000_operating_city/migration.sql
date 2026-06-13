-- Driver operating city for multi-city matching
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "operatingCity" TEXT NOT NULL DEFAULT 'Kinshasa';
