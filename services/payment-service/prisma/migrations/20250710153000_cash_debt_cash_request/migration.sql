CREATE TYPE "CashDebtCashRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "driver_cash_debt_cash_requests" (
    "id" TEXT NOT NULL,
    "driver_user_id" TEXT NOT NULL,
    "amount_cdf" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "status" "CashDebtCashRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "settlement_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_cash_debt_cash_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_cash_debt_cash_requests_code_key" ON "driver_cash_debt_cash_requests"("code");
CREATE INDEX "driver_cash_debt_cash_requests_driver_user_id_status_idx" ON "driver_cash_debt_cash_requests"("driver_user_id", "status");
