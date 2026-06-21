-- Location : modes logistique (passager / propriétaire / MOVA)
CREATE TYPE "RentalLogisticsMode" AS ENUM (
  'SELF_PASSENGER',
  'PASSENGER_DRIVER',
  'OWNER_DRIVER',
  'MOVA_DRIVER'
);

ALTER TABLE "rental_inquiries"
  ADD COLUMN "logisticsMode" "RentalLogisticsMode" NOT NULL DEFAULT 'SELF_PASSENGER',
  ADD COLUMN "passengerDriverName" TEXT,
  ADD COLUMN "passengerDriverPhone" TEXT,
  ADD COLUMN "ownerDriverName" TEXT,
  ADD COLUMN "ownerDriverPhone" TEXT;
