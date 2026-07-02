-- Commission plateforme sur ventes repas (restaurants partenaires)
ALTER TYPE "CommissionServiceType" ADD VALUE IF NOT EXISTS 'FOOD';

INSERT INTO "platform_commissions" ("id", "serviceType", "platformPercent", "driverPercent", "description", "isActive", "updatedAt")
VALUES (gen_random_uuid()::text, 'FOOD', 12, 88, 'Ventes repas — part MOVA sur le montant des plats', true, CURRENT_TIMESTAMP)
ON CONFLICT ("serviceType") DO NOTHING;
