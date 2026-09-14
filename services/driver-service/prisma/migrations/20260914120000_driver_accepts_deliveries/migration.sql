-- Dual-role flag: SENGA platform drivers do rides + deliveries by default.
-- Admin can set acceptsDeliveries=false for ride-only chauffeurs.
ALTER TABLE "driver_profiles"
  ADD COLUMN IF NOT EXISTS "acceptsDeliveries" BOOLEAN NOT NULL DEFAULT true;
