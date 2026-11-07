-- English versions of partner texts (menus, listings, ads)
CREATE TABLE IF NOT EXISTS "content_translations" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "en" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_translations_pkey" PRIMARY KEY ("id")
);
