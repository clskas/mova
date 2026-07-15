-- Commission plateforme sur ventes repas (restaurants partenaires)
-- NB : la valeur d'enum 'FOOD' est ajoutée dans la migration précédente
-- (20250627090000_food_commission_enum) pour éviter l'erreur Postgres 55P04
-- (usage d'une nouvelle valeur d'enum dans la transaction qui la crée).
INSERT INTO "platform_commissions" ("id", "serviceType", "platformPercent", "driverPercent", "description", "isActive", "updatedAt")
VALUES (gen_random_uuid()::text, 'FOOD', 12, 88, 'Ventes repas — part MOVA sur le montant des plats', true, CURRENT_TIMESTAMP)
ON CONFLICT ("serviceType") DO NOTHING;
