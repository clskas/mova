ALTER TABLE "vehicles" ADD COLUMN "typeApprovalStatus" "KycStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "vehicles" ADD COLUMN "typeApprovalNotes" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "typeApprovedAt" TIMESTAMP(3);

UPDATE "vehicles" v
SET "typeApprovalStatus" = 'APPROVED',
    "typeApprovedAt" = NOW()
FROM "driver_profiles" p
WHERE v."driverProfileId" = p.id
  AND p."kycStatus" = 'APPROVED';
