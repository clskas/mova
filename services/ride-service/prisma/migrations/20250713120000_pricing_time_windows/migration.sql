-- Plages horaires pointe / nuit par ville (admin CRUD)
CREATE TYPE "PricingTimeKind" AS ENUM ('PEAK', 'NIGHT');

CREATE TABLE IF NOT EXISTS "pricing_time_windows" (
  "id" TEXT NOT NULL,
  "city" TEXT NOT NULL DEFAULT 'Kinshasa',
  "kind" "PricingTimeKind" NOT NULL,
  "startHour" INTEGER NOT NULL,
  "endHour" INTEGER NOT NULL,
  "label" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_time_windows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pricing_time_windows_city_isActive_idx" ON "pricing_time_windows" ("city", "isActive");

INSERT INTO "pricing_time_windows" ("id", "city", "kind", "startHour", "endHour", "label", "sortOrder", "isActive", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Kinshasa', 'PEAK', 7, 9, 'Matin', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Kinshasa', 'PEAK', 17, 19, 'Soir', 2, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Kinshasa', 'NIGHT', 22, 5, 'Nuit', 3, true, CURRENT_TIMESTAMP);
