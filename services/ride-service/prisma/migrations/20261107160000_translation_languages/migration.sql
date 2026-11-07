-- Translations in several languages (en, sw, ln) in the same cache table
ALTER TABLE "content_translations" ADD COLUMN IF NOT EXISTS "lang" TEXT NOT NULL DEFAULT 'en';
CREATE INDEX IF NOT EXISTS "content_translations_lang_idx" ON "content_translations"("lang");
