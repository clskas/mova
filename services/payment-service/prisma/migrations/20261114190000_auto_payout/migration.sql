CREATE TABLE IF NOT EXISTS "auto_payout_settings" (
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auto_payout_settings_pkey" PRIMARY KEY ("userId")
);
