-- App language per device (fr | en)
ALTER TABLE "push_devices" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr';
