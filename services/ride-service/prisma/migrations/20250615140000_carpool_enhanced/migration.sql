-- AlterTable
ALTER TABLE "carpool_trips" ADD COLUMN "fromCity" TEXT;
ALTER TABLE "carpool_trips" ADD COLUMN "toCity" TEXT;
ALTER TABLE "carpool_trips" ADD COLUMN "meetingPoint" TEXT;
ALTER TABLE "carpool_trips" ADD COLUMN "ladiesOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "carpool_trips" ADD COLUMN "instantBooking" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "carpool_trips" ADD COLUMN "vehicleInfo" TEXT;
ALTER TABLE "carpool_trips" ADD COLUMN "distanceKm" DOUBLE PRECISION;
ALTER TABLE "carpool_trips" ADD COLUMN "durationMin" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "carpool_ratings" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carpool_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carpool_ratings_tripId_fromUserId_key" ON "carpool_ratings"("tripId", "fromUserId");
CREATE INDEX "carpool_ratings_toUserId_idx" ON "carpool_ratings"("toUserId");

-- AddForeignKey
ALTER TABLE "carpool_ratings" ADD CONSTRAINT "carpool_ratings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "carpool_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
