-- Driver search by zone: available drivers inside a square around the pickup.
CREATE INDEX IF NOT EXISTS "driver_profiles_isAvailable_currentLat_currentLng_idx" ON "driver_profiles"("isAvailable", "currentLat", "currentLng");
