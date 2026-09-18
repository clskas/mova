-- CITY_ADMIN role + optional managedCity for city-scoped admin panel access
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CITY_ADMIN';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "managedCity" TEXT;
