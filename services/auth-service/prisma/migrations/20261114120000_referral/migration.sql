ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referredById" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referredAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referralRewardedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "users_referralCode_key" ON "users"("referralCode");
CREATE INDEX IF NOT EXISTS "users_referredById_idx" ON "users"("referredById");
