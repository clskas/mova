CREATE TABLE "platform_config" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "config" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_config" ("id", "config", "updatedAt")
VALUES ('default', '{}', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "parcel_weight_bands" (
  "id" TEXT NOT NULL,
  "maxKg" DOUBLE PRECISION NOT NULL,
  "category" "WeightCategory" NOT NULL,
  "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "parcel_weight_bands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parcel_weight_bands_category_key" ON "parcel_weight_bands"("category");

INSERT INTO "parcel_weight_bands" ("id", "maxKg", "category", "multiplier", "label", "sortOrder", "isActive", "updatedAt")
VALUES
  (gen_random_uuid()::text, 0.5, 'DOCUMENTS', 1.0, 'Documents (≤ 0,5 kg)', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 1, 'SMALL', 1.1, 'Petit colis (≤ 1 kg)', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 5, 'MEDIUM', 1.25, 'Moyen (≤ 5 kg)', 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 50, 'LARGE', 1.5, 'Grand colis (≤ 50 kg)', 4, true, CURRENT_TIMESTAMP)
ON CONFLICT ("category") DO NOTHING;
