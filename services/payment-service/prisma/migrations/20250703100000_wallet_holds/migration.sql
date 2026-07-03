ALTER TABLE "wallets" ADD COLUMN "heldBalanceCdf" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "wallet_holds" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amountCdf" INTEGER NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallet_holds_referenceType_referenceId_key" ON "wallet_holds"("referenceType", "referenceId");
CREATE INDEX "wallet_holds_walletId_status_idx" ON "wallet_holds"("walletId", "status");

ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
