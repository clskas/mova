-- Service surcharges and promo codes for admin pricing management
CREATE TYPE "SurchargeType" AS ENUM ('DELIVERY_PARCEL', 'DELIVERY_FOOD', 'DELIVERY_EXPRESS', 'MOVING');

CREATE TABLE "service_surcharges" (
  "id" TEXT NOT NULL,
  "type" "SurchargeType" NOT NULL,
  "baseFeeCdf" INTEGER NOT NULL DEFAULT 0,
  "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "perUnitCdf" INTEGER,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_surcharges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_surcharges_type_key" ON "service_surcharges"("type");

CREATE TABLE "promo_codes" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "discountPercent" INTEGER,
  "discountCdf" INTEGER,
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

INSERT INTO "service_surcharges" ("id", "type", "baseFeeCdf", "multiplier", "perUnitCdf", "description", "isActive", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'DELIVERY_PARCEL', 0, 1.0, NULL, 'Colis — multiplicateur poids appliqué au tarif course', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DELIVERY_FOOD', 3000, 1.0, NULL, 'Livraison repas — frais de base CDF', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DELIVERY_EXPRESS', 0, 1.35, NULL, 'Livraison express — majoration 35%', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MOVING', 15000, 1.5, 8000, 'Déménagement — base + 50% course + CDF/m³', true, CURRENT_TIMESTAMP)
ON CONFLICT ("type") DO NOTHING;
