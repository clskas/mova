-- Remove legacy unique on name alone (blocks multi-city communes seed).
-- Init migration created INDEX communes_name_key; service_areas only dropped CONSTRAINT.
DROP INDEX IF EXISTS "communes_name_key";
