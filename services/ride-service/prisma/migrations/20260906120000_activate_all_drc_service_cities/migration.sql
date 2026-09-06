-- Nationwide DRC launch: activate every SENGA city and province already in DB.
-- Official catalogue (packages/shared DRC_SERVICE_AREAS) is entirely active.
-- Existing rows could stay inactive because seed used to skip isActive on update.
UPDATE "cities" SET "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP;
UPDATE "provinces" SET "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP;
