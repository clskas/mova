-- AfriSoft pay hub multi-app intents (VPS). Render also applies this unused table.
CREATE TABLE "hub_payments" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "amountCdf" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CDF',
    "phone" TEXT NOT NULL,
    "telecom" TEXT NOT NULL,
    "purpose" TEXT,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "failureReason" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'COLLECT',
    "notifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hub_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hub_payments_appId_reference_key" ON "hub_payments"("appId", "reference");
CREATE UNIQUE INDEX "hub_payments_appId_idempotencyKey_key" ON "hub_payments"("appId", "idempotencyKey");
CREATE INDEX "hub_payments_providerRef_idx" ON "hub_payments"("providerRef");
CREATE INDEX "hub_payments_appId_status_idx" ON "hub_payments"("appId", "status");
