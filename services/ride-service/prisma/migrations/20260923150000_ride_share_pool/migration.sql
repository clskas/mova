-- Uber Pool: shared rides + per-passenger bookings
CREATE TYPE "RideSharePassengerStatus" AS ENUM ('WAITING', 'PICKED_UP', 'DROPPED_OFF', 'CANCELLED');

ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "isShared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "shareSeatsTotal" INTEGER;

CREATE INDEX IF NOT EXISTS "rides_isShared_status_idx" ON "rides"("isShared", "status");

CREATE TABLE IF NOT EXISTS "ride_share_passengers" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupAddress" TEXT,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "dropoffAddress" TEXT,
    "fareCdf" INTEGER NOT NULL,
    "status" "RideSharePassengerStatus" NOT NULL DEFAULT 'WAITING',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedUpAt" TIMESTAMP(3),
    "droppedOffAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "ride_share_passengers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ride_share_passengers_rideId_idx" ON "ride_share_passengers"("rideId");
CREATE INDEX IF NOT EXISTS "ride_share_passengers_userId_idx" ON "ride_share_passengers"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ride_share_passengers_rideId_userId_key" ON "ride_share_passengers"("rideId", "userId");

ALTER TABLE "ride_share_passengers"
  DROP CONSTRAINT IF EXISTS "ride_share_passengers_rideId_fkey";
ALTER TABLE "ride_share_passengers"
  ADD CONSTRAINT "ride_share_passengers_rideId_fkey"
  FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;
