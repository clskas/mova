ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "promotionLabel" TEXT;

CREATE TABLE IF NOT EXISTS "delivery_ratings" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "restaurantScore" INTEGER NOT NULL,
    "courierScore" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_ratings_deliveryId_fromUserId_key" ON "delivery_ratings"("deliveryId", "fromUserId");

ALTER TABLE "delivery_ratings" DROP CONSTRAINT IF EXISTS "delivery_ratings_deliveryId_fkey";
ALTER TABLE "delivery_ratings" ADD CONSTRAINT "delivery_ratings_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
