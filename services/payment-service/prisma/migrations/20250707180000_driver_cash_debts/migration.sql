-- CreateEnum
CREATE TYPE "CashDebtCategory" AS ENUM ('PLATFORM_FEE', 'RESTAURANT_SHARE', 'PARTNER_SHARE');

-- CreateEnum
CREATE TYPE "CashDebtStatus" AS ENUM ('OPEN', 'SETTLED');

-- CreateTable
CREATE TABLE "driver_cash_debts" (
    "id" TEXT NOT NULL,
    "driverUserId" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "category" "CashDebtCategory" NOT NULL,
    "amountCdf" INTEGER NOT NULL,
    "status" "CashDebtStatus" NOT NULL DEFAULT 'OPEN',
    "beneficiaryUserId" TEXT,
    "description" TEXT,
    "reference" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3),
    "settlementRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_cash_debts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_cash_debts_reference_key" ON "driver_cash_debts"("reference");

-- CreateIndex
CREATE INDEX "driver_cash_debts_driverUserId_status_idx" ON "driver_cash_debts"("driverUserId", "status");
