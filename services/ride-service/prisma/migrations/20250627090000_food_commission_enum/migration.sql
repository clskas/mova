-- Ajout de la valeur d'enum FOOD dans une transaction dédiée.
-- Postgres interdit l'usage d'une nouvelle valeur d'enum dans la même transaction
-- que son ALTER TYPE ... ADD VALUE (erreur 55P04). On la commit donc ici,
-- avant son utilisation dans la migration 20250627100000_food_commission.
ALTER TYPE "CommissionServiceType" ADD VALUE IF NOT EXISTS 'FOOD';
