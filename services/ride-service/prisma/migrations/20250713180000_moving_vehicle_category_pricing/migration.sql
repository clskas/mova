CREATE TABLE "moving_vehicle_category_pricing" (
  "id" TEXT NOT NULL,
  "category" "MovingVehicleCategory" NOT NULL,
  "label" TEXT NOT NULL,
  "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "moving_vehicle_category_pricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "moving_vehicle_category_pricing_category_key" ON "moving_vehicle_category_pricing"("category");

INSERT INTO "moving_vehicle_category_pricing" ("id", "category", "label", "multiplier", "sortOrder", "isActive", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'CAMIONNETTE', 'Camionnette / pick-up', 0.85, 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAMION_15M3', 'Camion ~15 m³', 1.0, 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAMION_30M3', 'Camion ~30 m³', 1.45, 3, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAMION_50M3', 'Gros camion ~50 m³', 1.9, 4, true, CURRENT_TIMESTAMP)
ON CONFLICT ("category") DO NOTHING;
