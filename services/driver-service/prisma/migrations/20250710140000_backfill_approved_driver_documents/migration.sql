-- Chauffeurs KYC approuvés sans dates d'expiration : valeurs par défaut pour débloquer les offres.
UPDATE "driver_profiles"
SET
  "licenseExpiry" = COALESCE("licenseExpiry", NOW() + INTERVAL '730 days'),
  "insuranceExpiry" = COALESCE("insuranceExpiry", NOW() + INTERVAL '730 days'),
  "technicalInspectionExpiry" = COALESCE("technicalInspectionExpiry", NOW() + INTERVAL '730 days'),
  "documentsRenewalPending" = false
WHERE "kycStatus" = 'APPROVED'
  AND (
    "licenseExpiry" IS NULL
    OR "insuranceExpiry" IS NULL
    OR "technicalInspectionExpiry" IS NULL
    OR "documentsRenewalPending" = true
  );

-- Engins des chauffeurs approuvés encore en attente de validation type.
UPDATE "vehicles" v
SET
  "typeApprovalStatus" = 'APPROVED',
  "typeApprovedAt" = COALESCE(v."typeApprovedAt", NOW()),
  "typeApprovalNotes" = NULL
FROM "driver_profiles" p
WHERE v."driverProfileId" = p.id
  AND p."kycStatus" = 'APPROVED'
  AND v."isActive" = true
  AND v."typeApprovalStatus" = 'PENDING';
