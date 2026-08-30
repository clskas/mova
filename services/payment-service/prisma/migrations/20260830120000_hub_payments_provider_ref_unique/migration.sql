-- One hub row per aggregator reference. Empty strings treated as unset.
UPDATE "hub_payments" SET "providerRef" = NULL WHERE "providerRef" = '';

DELETE FROM hub_payments a
USING hub_payments b
WHERE a."providerRef" IS NOT NULL
  AND a."providerRef" = b."providerRef"
  AND a."createdAt" > b."createdAt";

DROP INDEX IF EXISTS "hub_payments_providerRef_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "hub_payments_providerRef_key"
ON "hub_payments" ("providerRef")
WHERE "providerRef" IS NOT NULL;
