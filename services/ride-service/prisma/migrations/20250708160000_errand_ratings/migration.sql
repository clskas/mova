CREATE TABLE IF NOT EXISTS "errand_ratings" (
  "id" TEXT NOT NULL,
  "errandId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "courierScore" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "errand_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "errand_ratings_errandId_fromUserId_key"
  ON "errand_ratings"("errandId", "fromUserId");

ALTER TABLE "errand_ratings"
  ADD CONSTRAINT "errand_ratings_errandId_fkey"
  FOREIGN KEY ("errandId") REFERENCES "errand_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
