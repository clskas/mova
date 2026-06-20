-- OCR KYC : extraction automatique des dates d'expiration sur justificatifs
CREATE TYPE "KycOcrStatus" AS ENUM ('PENDING', 'PROCESSING', 'MATCH', 'MISMATCH', 'UNREADABLE', 'SKIPPED');

ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "ocrStatus" "KycOcrStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "ocrExtractedExpiry" TIMESTAMP(3);
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "ocrProfileExpiry" TIMESTAMP(3);
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "ocrConfidence" DOUBLE PRECISION;
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "ocrNotes" TEXT;
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "ocrCheckedAt" TIMESTAMP(3);
