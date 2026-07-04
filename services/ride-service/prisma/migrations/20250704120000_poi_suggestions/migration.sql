CREATE TYPE "PoiSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "poi_suggestions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PlaceOfInterestCategory" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "status" "PoiSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedPoiId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poi_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "poi_suggestions_status_createdAt_idx" ON "poi_suggestions"("status", "createdAt");
CREATE INDEX "poi_suggestions_userId_status_idx" ON "poi_suggestions"("userId", "status");
