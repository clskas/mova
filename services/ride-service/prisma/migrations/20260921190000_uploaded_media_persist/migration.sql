-- Persist partner/menu photos across Render redeploys (ephemeral disk).
CREATE TABLE IF NOT EXISTS "uploaded_media" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uploaded_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uploaded_media_category_filename_key" ON "uploaded_media"("category", "filename");
CREATE INDEX IF NOT EXISTS "uploaded_media_category_idx" ON "uploaded_media"("category");
