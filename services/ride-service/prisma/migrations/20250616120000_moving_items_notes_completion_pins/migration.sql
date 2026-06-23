-- Inventaire déménagement + PIN espèces
ALTER TABLE "moving_requests" ADD COLUMN IF NOT EXISTS "itemsNotes" TEXT;
ALTER TABLE "moving_requests" ADD COLUMN IF NOT EXISTS "completionPin" TEXT;

-- PIN espèces courses planifiées
ALTER TABLE "scheduled_rides" ADD COLUMN IF NOT EXISTS "completionPin" TEXT;
