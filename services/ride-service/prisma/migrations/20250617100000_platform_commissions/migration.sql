-- Commission plateforme MOVA par type de service (idempotent)
DO $$ BEGIN
  CREATE TYPE "CommissionServiceType" AS ENUM ('RIDE', 'DELIVERY', 'MOVING', 'RENTAL', 'CARPOOL', 'ERRAND');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "platform_commissions" (
  "id" TEXT NOT NULL,
  "serviceType" "CommissionServiceType" NOT NULL,
  "platformPercent" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "driverPercent" DOUBLE PRECISION NOT NULL DEFAULT 85,
  "fixedFeeCdf" INTEGER,
  "perItemFeeCdf" INTEGER,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_commissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_commissions_serviceType_key" ON "platform_commissions"("serviceType");

INSERT INTO "platform_commissions" ("id", "serviceType", "platformPercent", "driverPercent", "fixedFeeCdf", "perItemFeeCdf", "description", "isActive", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'RIDE', 15, 85, NULL, NULL, 'Courses taxi / moto — part MOVA sur le tarif course', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DELIVERY', 20, 80, NULL, NULL, 'Livraisons colis, repas et express', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MOVING', 18, 82, NULL, NULL, 'Déménagements', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'RENTAL', 12, 88, NULL, NULL, 'Location véhicule longue durée', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CARPOOL', 10, 90, NULL, NULL, 'Covoiturage — par place réservée', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ERRAND', 15, 85, 2500, 1500, 'Courses & commissions — frais fixes + par article', true, CURRENT_TIMESTAMP)
ON CONFLICT ("serviceType") DO NOTHING;
