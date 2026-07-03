-- Codes promo : traçabilité sur les commandes payantes
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "promoCode" TEXT;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "discountCdf" INTEGER;

ALTER TABLE "scheduled_rides" ADD COLUMN IF NOT EXISTS "promoCode" TEXT;
ALTER TABLE "scheduled_rides" ADD COLUMN IF NOT EXISTS "discountCdf" INTEGER;

ALTER TABLE "errand_orders" ADD COLUMN IF NOT EXISTS "promoCode" TEXT;
ALTER TABLE "errand_orders" ADD COLUMN IF NOT EXISTS "discountCdf" INTEGER;

ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "promoCode" TEXT;
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "discountCdf" INTEGER;

ALTER TABLE "moving_requests" ADD COLUMN IF NOT EXISTS "promoCode" TEXT;
ALTER TABLE "moving_requests" ADD COLUMN IF NOT EXISTS "discountCdf" INTEGER;

ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "promoCode" TEXT;
ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "discountCdf" INTEGER;

INSERT INTO "promo_codes" ("id", "code", "discountPercent", "discountCdf", "maxUses", "usedCount", "validFrom", "validUntil", "isActive", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'MOVA10',
  10,
  NULL,
  1000,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '1 year',
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
