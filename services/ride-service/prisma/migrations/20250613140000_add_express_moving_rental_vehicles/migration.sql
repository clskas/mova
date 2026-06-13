-- AlterEnum
ALTER TYPE "DeliveryType" ADD VALUE 'EXPRESS';

-- AlterEnum
ALTER TYPE "RentalInquiryStatus" ADD VALUE 'CONFIRMED';

-- CreateEnum
CREATE TYPE "MovingRequestStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "rental_vehicles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "dailyRateCdf" INTEGER NOT NULL,
    "depositCdf" INTEGER NOT NULL DEFAULT 50000,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moving_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MovingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "volumeM3" DOUBLE PRECISION NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "estimatedPriceCdf" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "durationMin" DOUBLE PRECISION,
    "driverId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moving_requests_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "rental_inquiries" ADD COLUMN "vehicleId" TEXT;
ALTER TABLE "rental_inquiries" ADD COLUMN "estimatedPriceCdf" INTEGER;

-- CreateIndex
CREATE INDEX "moving_requests_userId_idx" ON "moving_requests"("userId");
CREATE INDEX "moving_requests_status_idx" ON "moving_requests"("status");

-- AddForeignKey
ALTER TABLE "rental_inquiries" ADD CONSTRAINT "rental_inquiries_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "rental_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
