-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "adminPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
