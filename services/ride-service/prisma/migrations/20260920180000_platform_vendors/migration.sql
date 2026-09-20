-- CreateTable
CREATE TABLE IF NOT EXISTS "platform_vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "amountUsd" DOUBLE PRECISION,
    "billingCycle" TEXT,
    "nextPaymentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "alertDaysBefore" INTEGER NOT NULL DEFAULT 14,
    "notifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "url" TEXT,
    "lastAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_vendors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "platform_vendors_expiresAt_idx" ON "platform_vendors"("expiresAt");
CREATE INDEX IF NOT EXISTS "platform_vendors_nextPaymentAt_idx" ON "platform_vendors"("nextPaymentAt");
