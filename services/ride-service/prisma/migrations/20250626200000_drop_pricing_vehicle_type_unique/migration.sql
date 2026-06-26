-- Remove legacy unique on vehicleType alone (blocks per-city pricing rules).
-- Init migration created INDEX pricing_rules_vehicleType_key; service_areas only dropped CONSTRAINT.
DROP INDEX IF EXISTS "pricing_rules_vehicleType_key";
