-- Cash timeout: soft-unblock + dispute + passenger claim + auto-confirm
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cashDisputedAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cashDisputeReason" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "passengerClaimedPaidAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "autoConfirmedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "payments_method_status_createdAt_idx"
  ON "payments"("method", "status", "createdAt");

ALTER TABLE "service_payments" ADD COLUMN IF NOT EXISTS "cashDisputedAt" TIMESTAMP(3);
ALTER TABLE "service_payments" ADD COLUMN IF NOT EXISTS "cashDisputeReason" TEXT;
ALTER TABLE "service_payments" ADD COLUMN IF NOT EXISTS "passengerClaimedPaidAt" TIMESTAMP(3);
ALTER TABLE "service_payments" ADD COLUMN IF NOT EXISTS "autoConfirmedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "service_payments_method_status_createdAt_idx"
  ON "service_payments"("method", "status", "createdAt");
