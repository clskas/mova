-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN "cityNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
