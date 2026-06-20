CREATE TYPE "TrackingReferenceType" AS ENUM ('RIDE', 'DELIVERY', 'ERRAND', 'MOVING');

CREATE TABLE "tracking_points" (
    "id" TEXT NOT NULL,
    "referenceType" "TrackingReferenceType" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_points_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tracking_points_referenceType_referenceId_recordedAt_idx" ON "tracking_points"("referenceType", "referenceId", "recordedAt");
