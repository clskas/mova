CREATE TABLE IF NOT EXISTS "loyalty_accounts" (
  "userId" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("userId")
);
CREATE TABLE IF NOT EXISTS "loyalty_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loyalty_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_events_reference_key" ON "loyalty_events"("reference");
CREATE INDEX IF NOT EXISTS "loyalty_events_userId_idx" ON "loyalty_events"("userId");
