ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CORPORATE';

CREATE TABLE IF NOT EXISTS "corporate_accounts" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "contactEmail" TEXT,
  "creditLimitCdf" INTEGER NOT NULL DEFAULT 500000,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "corporate_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "corporate_members" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corporate_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "corporate_members_userId_key" ON "corporate_members"("userId");
CREATE INDEX IF NOT EXISTS "corporate_members_accountId_idx" ON "corporate_members"("accountId");
DO $$ BEGIN
  ALTER TABLE "corporate_members" ADD CONSTRAINT "corporate_members_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "corporate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
