ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "proposedFareCdf" INTEGER;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "listFareCdf" INTEGER;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "womenDriverOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "favorite_drivers" (
  "id" TEXT NOT NULL,
  "passengerId" TEXT NOT NULL,
  "driverUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "favorite_drivers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "favorite_drivers_passengerId_driverUserId_key" ON "favorite_drivers"("passengerId", "driverUserId");
CREATE INDEX IF NOT EXISTS "favorite_drivers_passengerId_idx" ON "favorite_drivers"("passengerId");
