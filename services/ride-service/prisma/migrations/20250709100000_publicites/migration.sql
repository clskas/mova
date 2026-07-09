-- CreateEnum
CREATE TYPE "PubliciteCible" AS ENUM ('TOUS', 'PASSENGER', 'DRIVER', 'RESTAURANT');

-- CreateTable
CREATE TABLE "publicites" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "lien" TEXT,
    "description" TEXT,
    "cible" "PubliciteCible" NOT NULL DEFAULT 'TOUS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publicites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publicites_isActive_dateDebut_dateFin_idx" ON "publicites"("isActive", "dateDebut", "dateFin");
