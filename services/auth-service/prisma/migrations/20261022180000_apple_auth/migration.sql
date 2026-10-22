-- Sign in with Apple: unique appleId (nullable).
ALTER TABLE "users" ADD COLUMN "appleId" TEXT;
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");
