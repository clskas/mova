-- Optional: require positive wallet balance to receive job offers/notifications.
ALTER TABLE "driver_debt_policies"
  ADD COLUMN IF NOT EXISTS "require_positive_wallet_balance" BOOLEAN NOT NULL DEFAULT false;
