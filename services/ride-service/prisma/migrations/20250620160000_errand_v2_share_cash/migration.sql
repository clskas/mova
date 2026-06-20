-- ErrandOrder v2 fields
ALTER TABLE "errand_orders" ADD COLUMN IF NOT EXISTS "items" JSONB;
ALTER TABLE "errand_orders" ADD COLUMN IF NOT EXISTS "budgetCdf" INTEGER;
ALTER TABLE "errand_orders" ADD COLUMN IF NOT EXISTS "finalPriceCdf" INTEGER;
ALTER TABLE "errand_orders" ADD COLUMN IF NOT EXISTS "purchaseTotalCdf" INTEGER;
ALTER TABLE "errand_orders" ADD COLUMN IF NOT EXISTS "proofPhotoUrl" TEXT;
ALTER TABLE "errand_orders" ADD COLUMN IF NOT EXISTS "completionPin" TEXT;

-- Ride cash PIN
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "completionPin" TEXT;

-- Public trip share links
CREATE TABLE IF NOT EXISTS "trip_share_links" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trip_share_links_token_key" ON "trip_share_links"("token");
CREATE INDEX IF NOT EXISTS "trip_share_links_rideId_idx" ON "trip_share_links"("rideId");
