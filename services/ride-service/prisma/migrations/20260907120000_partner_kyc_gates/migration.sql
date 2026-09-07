-- Admin KYC gates for restaurants and rental partners.

CREATE TYPE "PartnerKycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "PartnerKycSubject" AS ENUM ('RESTAURANT', 'RENTAL_PARTNER');
CREATE TYPE "RentalPartnerType" AS ENUM ('COMPANY', 'INDIVIDUAL');

ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "kycStatus" "PartnerKycStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "kycNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "nif" TEXT,
  ADD COLUMN IF NOT EXISTS "rccm" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutPhone" TEXT;

UPDATE "restaurants"
SET "kycStatus" = 'APPROVED'
WHERE "isActive" = true AND "isAcceptingOrders" = true;

UPDATE "restaurants"
SET "isAcceptingOrders" = false
WHERE "kycStatus" <> 'APPROVED';

CREATE TABLE IF NOT EXISTS "rental_partner_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerType" "RentalPartnerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "kycStatus" "PartnerKycStatus" NOT NULL DEFAULT 'PENDING',
    "kycNotes" TEXT,
    "nif" TEXT,
    "rccm" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rental_partner_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rental_partner_profiles_userId_key"
  ON "rental_partner_profiles"("userId");

INSERT INTO "rental_partner_profiles" ("id", "userId", "partnerType", "kycStatus", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, owners."ownerUserId", 'INDIVIDUAL', 'APPROVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "ownerUserId"
  FROM "rental_vehicles"
  WHERE "ownerUserId" IS NOT NULL
    AND "approvalStatus" = 'APPROVED'
) owners
ON CONFLICT ("userId") DO NOTHING;

CREATE TABLE IF NOT EXISTS "partner_kyc_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" "PartnerKycSubject" NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "PartnerKycStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_kyc_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "partner_kyc_documents_userId_subject_idx"
  ON "partner_kyc_documents"("userId", "subject");
