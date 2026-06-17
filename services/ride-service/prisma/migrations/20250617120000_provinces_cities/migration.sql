-- Provinces & cities (zones MOVA administrables)
CREATE TABLE IF NOT EXISTS "provinces" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "provinces_name_key" ON "provinces"("name");

CREATE TABLE IF NOT EXISTS "cities" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provinceId" TEXT NOT NULL,
  "centerLat" DOUBLE PRECISION NOT NULL,
  "centerLng" DOUBLE PRECISION NOT NULL,
  "minLat" DOUBLE PRECISION NOT NULL,
  "maxLat" DOUBLE PRECISION NOT NULL,
  "minLng" DOUBLE PRECISION NOT NULL,
  "maxLng" DOUBLE PRECISION NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cities_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "provinces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cities_slug_key" ON "cities"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "cities_name_provinceId_key" ON "cities"("name", "provinceId");
