-- Idempotent ledger: one row per (reference, type) when reference is set.
DELETE FROM wallet_transactions a
USING wallet_transactions b
WHERE a.reference IS NOT NULL
  AND a.reference = b.reference
  AND a.type = b.type
  AND a."createdAt" > b."createdAt";

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_reference_type_key"
ON "wallet_transactions" ("reference", "type")
WHERE "reference" IS NOT NULL;

-- One active subscription per user+plan (prevents double-subscribe race).
CREATE UNIQUE INDEX IF NOT EXISTS "user_subscriptions_active_user_plan_key"
ON "user_subscriptions" ("userId", "planId")
WHERE "status" = 'ACTIVE';
