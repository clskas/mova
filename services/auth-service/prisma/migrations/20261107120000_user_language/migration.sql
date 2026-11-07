-- Language chosen in the app (fr | en)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr';
