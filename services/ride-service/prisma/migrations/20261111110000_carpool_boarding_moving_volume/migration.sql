ALTER TABLE "carpool_passengers" ADD COLUMN IF NOT EXISTS "boardedAt" TIMESTAMP(3);
ALTER TABLE "carpool_passengers" ADD COLUMN IF NOT EXISTS "noShowAt" TIMESTAMP(3);
ALTER TABLE "carpool_passengers" ADD COLUMN IF NOT EXISTS "notTravelledAt" TIMESTAMP(3);
ALTER TABLE "moving_requests" ADD COLUMN IF NOT EXISTS "declaredVolumeM3" DOUBLE PRECISION;
ALTER TABLE "moving_requests" ADD COLUMN IF NOT EXISTS "volumeAdjustedAt" TIMESTAMP(3);
