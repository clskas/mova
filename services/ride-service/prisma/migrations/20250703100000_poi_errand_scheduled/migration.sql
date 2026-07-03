-- POI, errand enhancements, scheduled ride enhancements

CREATE TYPE "ErrandCategory" AS ENUM ('PHARMACY', 'MARKET', 'OTHER');
CREATE TYPE "PlaceOfInterestCategory" AS ENUM ('MARKET', 'HOSPITAL', 'UNIVERSITY', 'PHARMACY', 'SCHOOL', 'GOVERNMENT', 'TRANSPORT', 'OTHER');

ALTER TABLE "errand_orders" ADD COLUMN "category" "ErrandCategory" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "errand_orders" ADD COLUMN "walletHoldCdf" INTEGER;
ALTER TABLE "errand_orders" ADD COLUMN "estimatedPurchaseCdf" INTEGER;

ALTER TABLE "scheduled_rides" ADD COLUMN "cancellationFeeCdf" INTEGER;
ALTER TABLE "scheduled_rides" ADD COLUMN "reminderDayBeforeSentAt" TIMESTAMP(3);
ALTER TABLE "scheduled_rides" ADD COLUMN "reminderHourBeforeSentAt" TIMESTAMP(3);
ALTER TABLE "scheduled_rides" ADD COLUMN "autoAssignAttemptedAt" TIMESTAMP(3);

CREATE TABLE "places_of_interest" (
    "id" TEXT NOT NULL,
    "osmId" TEXT,
    "name" TEXT NOT NULL,
    "category" "PlaceOfInterestCategory" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "source" TEXT NOT NULL DEFAULT 'OSM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_of_interest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "places_of_interest_osmId_key" ON "places_of_interest"("osmId");
CREATE INDEX "places_of_interest_city_category_idx" ON "places_of_interest"("city", "category");
CREATE INDEX "places_of_interest_lat_lng_idx" ON "places_of_interest"("lat", "lng");

CREATE TABLE "scheduled_driver_volunteers" (
    "id" TEXT NOT NULL,
    "scheduledRideId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_driver_volunteers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scheduled_driver_volunteers_scheduledRideId_driverId_key" ON "scheduled_driver_volunteers"("scheduledRideId", "driverId");
CREATE INDEX "scheduled_driver_volunteers_scheduledRideId_idx" ON "scheduled_driver_volunteers"("scheduledRideId");

ALTER TABLE "scheduled_driver_volunteers" ADD CONSTRAINT "scheduled_driver_volunteers_scheduledRideId_fkey" FOREIGN KEY ("scheduledRideId") REFERENCES "scheduled_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "errand_chat_messages" (
    "id" TEXT NOT NULL,
    "errandId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errand_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "errand_chat_messages_errandId_createdAt_idx" ON "errand_chat_messages"("errandId", "createdAt");
