-- Three service modes: BOTH (default), RIDES_ONLY, DELIVERIES_ONLY.
-- acceptsDeliveries already exists; acceptsRides completes the matrix.
ALTER TABLE "driver_profiles"
  ADD COLUMN IF NOT EXISTS "acceptsRides" BOOLEAN NOT NULL DEFAULT true;
