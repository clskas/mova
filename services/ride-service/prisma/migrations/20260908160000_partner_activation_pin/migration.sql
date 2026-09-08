-- Restaurant / rental: confirm the KYC activation PIN once after dossier approval.

ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "activationPinVerifiedAt" TIMESTAMP(3);

ALTER TABLE "rental_partner_profiles"
  ADD COLUMN IF NOT EXISTS "activationPinVerifiedAt" TIMESTAMP(3);
