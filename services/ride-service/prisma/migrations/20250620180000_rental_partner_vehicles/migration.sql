CREATE TYPE "RentalVehicleApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
ALTER TABLE "rental_vehicles" ADD COLUMN IF NOT EXISTS "approvalStatus" "RentalVehicleApprovalStatus" NOT NULL DEFAULT 'APPROVED';

CREATE INDEX IF NOT EXISTS "rental_vehicles_ownerUserId_idx" ON "rental_vehicles"("ownerUserId");
