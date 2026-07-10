CREATE TABLE IF NOT EXISTS "driver_debt_policies" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "max_open_debt_cdf" INTEGER NOT NULL DEFAULT 50000,
  "block_offers" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_debt_policies_pkey" PRIMARY KEY ("id")
);

INSERT INTO "driver_debt_policies" ("id", "max_open_debt_cdf", "block_offers", "is_active", "updated_at")
VALUES ('default', 50000, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
