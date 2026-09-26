-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "homeCity" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_homeCity_idx" ON "users"("homeCity");
