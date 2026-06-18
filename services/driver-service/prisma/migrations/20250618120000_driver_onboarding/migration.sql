-- Parcours d'enregistrement chauffeur (infos, paiement, activation PIN)
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "idDocumentNumber" TEXT;
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "licenseExpiry" TIMESTAMP(3);
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "insuranceExpiry" TIMESTAMP(3);
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "technicalInspectionExpiry" TIMESTAMP(3);
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "payoutProvider" TEXT;
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "payoutPhone" TEXT;
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "charterAcceptedAt" TIMESTAMP(3);
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "trainingCompletedAt" TIMESTAMP(3);
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "activationPin" TEXT;
ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "activationPinVerifiedAt" TIMESTAMP(3);
