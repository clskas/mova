-- CreateEnum
CREATE TYPE "CarpoolStatus" AS ENUM ('OPEN', 'MATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ErrandOrderStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RentalInquiryStatus" AS ENUM ('PENDING', 'CONTACTED', 'CLOSED');

-- CreateTable
CREATE TABLE "carpool_trips" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "CarpoolStatus" NOT NULL DEFAULT 'OPEN',
    "departureAt" TIMESTAMP(3) NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupAddress" TEXT,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "dropoffAddress" TEXT,
    "seatsTotal" INTEGER NOT NULL DEFAULT 3,
    "seatsAvailable" INTEGER NOT NULL,
    "pricePerSeatCdf" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carpool_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carpool_passengers" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carpool_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errand_orders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ErrandOrderStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "estimatedPriceCdf" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "durationMin" DOUBLE PRECISION,
    "driverId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "errand_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_inquiries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RentalInquiryStatus" NOT NULL DEFAULT 'PENDING',
    "vehicleType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "pickupAddress" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carpool_trips_driverId_idx" ON "carpool_trips"("driverId");

-- CreateIndex
CREATE INDEX "carpool_trips_status_idx" ON "carpool_trips"("status");

-- CreateIndex
CREATE INDEX "carpool_trips_departureAt_idx" ON "carpool_trips"("departureAt");

-- CreateIndex
CREATE UNIQUE INDEX "carpool_passengers_tripId_userId_key" ON "carpool_passengers"("tripId", "userId");

-- CreateIndex
CREATE INDEX "carpool_passengers_userId_idx" ON "carpool_passengers"("userId");

-- CreateIndex
CREATE INDEX "errand_orders_userId_idx" ON "errand_orders"("userId");

-- CreateIndex
CREATE INDEX "errand_orders_status_idx" ON "errand_orders"("status");

-- CreateIndex
CREATE INDEX "rental_inquiries_userId_idx" ON "rental_inquiries"("userId");

-- CreateIndex
CREATE INDEX "rental_inquiries_status_idx" ON "rental_inquiries"("status");

-- AddForeignKey
ALTER TABLE "carpool_passengers" ADD CONSTRAINT "carpool_passengers_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "carpool_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
