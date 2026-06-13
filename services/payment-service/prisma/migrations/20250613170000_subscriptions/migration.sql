-- Subscription plans MVP (MOVA Plus)
CREATE TYPE "SubscriptionTarget" AS ENUM ('PASSENGER', 'DRIVER');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');

CREATE TABLE "subscription_plans" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "target" "SubscriptionTarget" NOT NULL,
  "monthlyPriceCdf" INTEGER NOT NULL,
  "feeReductionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "priorityMatching" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

CREATE TABLE "user_subscriptions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_subscriptions_userId_idx" ON "user_subscriptions"("userId");
CREATE INDEX "user_subscriptions_planId_idx" ON "user_subscriptions"("planId");
CREATE INDEX "user_subscriptions_status_idx" ON "user_subscriptions"("status");

ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "subscription_plans" ("id", "code", "name", "target", "monthlyPriceCdf", "feeReductionPercent", "priorityMatching", "description", "isActive", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'MOVA_PLUS_PASSENGER', 'MOVA Plus Passager', 'PASSENGER', 15000, 10, true, 'Frais réduits et priorité de matching', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MOVA_PLUS_DRIVER', 'MOVA Plus Chauffeur', 'DRIVER', 20000, 5, true, 'Commission réduite et priorité de courses', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
