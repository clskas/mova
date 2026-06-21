-- Assignation chauffeur MOVA pour livraison / remise véhicule location
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "driverId" TEXT;

CREATE INDEX IF NOT EXISTS "rental_inquiries_driverId_idx" ON "rental_inquiries"("driverId");
