-- Business profile fields for rental partner onboarding (parity with restaurants).

ALTER TABLE "rental_partner_profiles"
  ADD COLUMN IF NOT EXISTS "businessName" TEXT NOT NULL DEFAULT 'Ma location',
  ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT 'À préciser',
  ADD COLUMN IF NOT EXISTS "address" TEXT NOT NULL DEFAULT 'Kinshasa — à compléter',
  ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION NOT NULL DEFAULT -4.3105,
  ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION NOT NULL DEFAULT 15.3032;

-- Existing partners: avoid forcing onboarding; prefer vehicle owner/city when present.
UPDATE "rental_partner_profiles" AS p
SET
  "businessName" = COALESCE(NULLIF(TRIM(v."ownerName"), ''), 'Partenaire location'),
  "city" = COALESCE(NULLIF(TRIM(v."city"), ''), 'Kinshasa'),
  "address" = COALESCE(NULLIF(TRIM(v."city"), ''), 'Kinshasa')
FROM (
  SELECT DISTINCT ON ("ownerUserId")
    "ownerUserId",
    "ownerName",
    "city"
  FROM "rental_vehicles"
  WHERE "ownerUserId" IS NOT NULL
  ORDER BY "ownerUserId", "createdAt" ASC
) AS v
WHERE p."userId" = v."ownerUserId"
  AND p."businessName" = 'Ma location';

UPDATE "rental_partner_profiles"
SET
  "businessName" = 'Partenaire location',
  "city" = 'Kinshasa',
  "address" = 'Kinshasa'
WHERE "businessName" = 'Ma location'
  AND "city" = 'À préciser'
  AND "address" = 'Kinshasa — à compléter';
