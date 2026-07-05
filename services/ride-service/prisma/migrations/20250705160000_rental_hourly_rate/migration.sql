-- Tarif horaire optionnel (sinon dérivé du tarif journalier)
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "hourlyRateCdf" INTEGER;
