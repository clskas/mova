-- Escrow collect vs payout release on ServicePayment.

ALTER TABLE "service_payments"
  ADD COLUMN IF NOT EXISTS "escrowHeld" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "payoutReleased" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fundsFrozen" BOOLEAN NOT NULL DEFAULT false;
