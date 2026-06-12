CREATE TYPE "PaymentMethod" AS ENUM ('WALLET', 'ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY', 'CASH');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
CREATE TABLE "payments" ("id" TEXT NOT NULL, "rideId" TEXT NOT NULL, "userId" TEXT NOT NULL, "amountCdf" INTEGER NOT NULL, "method" "PaymentMethod" NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING', "providerRef" TEXT, "failureReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "payments_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "payments_rideId_key" ON "payments"("rideId");
CREATE TABLE "wallets" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "balanceCdf" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "wallets_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");
CREATE TABLE "wallet_transactions" ("id" TEXT NOT NULL, "walletId" TEXT NOT NULL, "amountCdf" INTEGER NOT NULL, "type" TEXT NOT NULL, "description" TEXT, "reference" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"));
CREATE INDEX "wallet_transactions_walletId_idx" ON "wallet_transactions"("walletId");
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
