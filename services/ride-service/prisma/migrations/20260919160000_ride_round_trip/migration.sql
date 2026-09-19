-- Aller-retour taxi : même chauffeur, jambe aller puis retour.
CREATE TYPE "RoundTripLeg" AS ENUM ('OUTBOUND', 'RETURN');

ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "roundTrip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "roundTripLeg" "RoundTripLeg";
