import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { GENERATED_LANGUAGES, UI_SOURCE_STRINGS, serverSourceTexts, type AppLanguage } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { runAiText } from '../common/ai-vision.util';
import { ClientAppsConfigService } from '../platform/client-apps-config.service';
import { MAX_CONTENT_TEXT, applyContentTranslations, collectContentTexts } from './content-translation.util';

const BATCH = 50;
const QUEUE_LIMIT = 8000;
const WORKER_MS = 15_000;
const DICT_CACHE_MS = 5 * 60_000;

/** Cache key of a translation. English keeps the original key (sha1 of the text). */
export function translationKey(lang: AppLanguage, source: string): string {
  const raw = lang === 'en' ? source : `${lang}:${source}`;
  return createHash('sha1').update(raw, 'utf8').digest('hex');
}

/** Placeholders ({name}, {0}) and line breaks must survive the translation. */
export function keepsPlaceholders(source: string, translated: string): boolean {
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join('|');
  const nl = (s: string) => (s.match(/\n/g) ?? []).length;
  return ph(source) === ph(translated) && (nl(source) === 0 || nl(translated) > 0);
}

/**
 * Translations made once by Claude and cached in content_translations (column `en` holds the
 * translated text, whatever the language):
 * - partner content (menus, listings, ads) for English, Swahili and Lingala users;
 * - the app and server dictionaries for Swahili and Lingala (English ones are bundled).
 * A text seen for the first time stays in French and is queued; the next request gets it translated.
 */
@Injectable()
export class ContentTranslationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentTranslationService.name);
  private readonly queues = new Map<AppLanguage, Set<string>>();
  private readonly dictCache = new Map<string, { at: number; strings: Record<string, string> }>();
  private timer?: NodeJS.Timeout;
  private running = false;
  private aiOffUntil = 0;
  private turn = 0;

  constructor(
    private prisma: PrismaService,
    private appsConfig: ClientAppsConfigService,
  ) {}

  onModuleInit() {
    if (process.env.CONTENT_TRANSLATION === 'false') return;
    this.timer = setInterval(() => void this.flush(), WORKER_MS);
    this.timer.unref?.();
    // Warm-up: queue the live catalogues and the missing dictionaries once.
    const warm = setTimeout(() => void this.warmUp(), 60_000);
    warm.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Languages the super admin left visible (only those are translated). */
  private enabledLanguages(): AppLanguage[] {
    const l = (this.appsConfig.getPublic() as { languages?: Record<string, boolean> }).languages ?? {};
    if (l.pickerVisible === false) return [];
    return (['en', 'sw', 'ln'] as AppLanguage[]).filter((k) => l[k] !== false);
  }

  private queue(lang: AppLanguage): Set<string> {
    let q = this.queues.get(lang);
    if (!q) this.queues.set(lang, (q = new Set()));
    return q;
  }

  private queuedCount() {
    let n = 0;
    for (const q of this.queues.values()) n += q.size;
    return n;
  }

  private enqueueTexts(lang: AppLanguage, texts: Iterable<string>) {
    const q = this.queue(lang);
    for (const t of texts) if (this.queuedCount() < QUEUE_LIMIT) q.add(t);
  }

  private async known(lang: AppLanguage, texts: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let i = 0; i < texts.length; i += 500) {
      const chunk = texts.slice(i, i + 500);
      const rows = await this.prisma.contentTranslation.findMany({
        where: { id: { in: chunk.map((t) => translationKey(lang, t)) } },
        select: { source: true, en: true },
      });
      for (const r of rows) out.set(r.source, r.en);
    }
    return out;
  }

  private async warmUp() {
    try {
      const langs = this.enabledLanguages();
      if (langs.length === 0) return;
      // Sequential: the service shares a small pool of database connections.
      const restaurants = await this.prisma.restaurant.findMany({
        where: { isActive: true },
        select: { name: true, cuisine: true, promotionLabel: true, menuItems: true },
        take: 300,
      });
      const vehicles = await this.prisma.rentalVehicle.findMany({
        where: { isActive: true },
        select: { name: true, category: true, description: true, dailyRateCdf: true },
        take: 500,
      });
      const ads = await this.prisma.publicite.findMany({ where: { isActive: true }, select: { titre: true, description: true }, take: 100 });
      const content = [...collectContentTexts([restaurants, vehicles, ads])];
      for (const lang of langs) {
        // Dictionaries first (the whole app depends on them), then partner content.
        const dict = GENERATED_LANGUAGES.includes(lang) ? [...UI_SOURCE_STRINGS, ...serverSourceTexts()] : [];
        const wanted = [...new Set([...dict, ...content])];
        const have = await this.known(lang, wanted);
        this.enqueueTexts(lang, wanted.filter((t) => !have.has(t)));
      }
      this.logger.log(`translation warm-up: ${this.queuedCount()} text(s) queued for ${langs.join(', ')}`);
    } catch (e) {
      this.logger.warn(`translation warm-up skipped: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  /** Translates the partner texts of a response body for a user who chose [lang]. */
  async translateBody<T>(body: T, lang: AppLanguage = 'en'): Promise<T> {
    if (lang === 'fr') return body;
    const texts = [...collectContentTexts(body)];
    if (texts.length === 0) return body;
    let dict: Map<string, string>;
    try {
      dict = await this.known(lang, texts);
    } catch (e) {
      this.logger.warn(`content translation lookup failed: ${(e as Error).message.slice(0, 160)}`);
      return body;
    }
    if (this.enabledLanguages().includes(lang)) this.enqueueTexts(lang, texts.filter((t) => !dict.has(t)));
    return applyContentTranslations(body, dict) as T;
  }

  /**
   * Dictionary of a generated language: the app's texts ('ui') or the server's texts ('server'),
   * as { french: translation } — only the texts already translated.
   */
  async dictionary(lang: AppLanguage, kind: 'ui' | 'server') {
    const sources = kind === 'ui' ? [...UI_SOURCE_STRINGS] : serverSourceTexts();
    const cacheKey = `${lang}:${kind}`;
    const cached = this.dictCache.get(cacheKey);
    if (cached && Date.now() - cached.at < DICT_CACHE_MS) {
      return { lang, strings: cached.strings, total: sources.length, done: Object.keys(cached.strings).length };
    }
    const have = await this.known(lang, sources);
    const strings = Object.fromEntries(have);
    this.dictCache.set(cacheKey, { at: Date.now(), strings });
    if (this.enabledLanguages().includes(lang) && have.size < sources.length) {
      this.enqueueTexts(lang, sources.filter((s) => !have.has(s)));
    }
    return { lang, strings, total: sources.length, done: have.size };
  }

  /** Background: translate queued texts in small batches, one language per turn. */
  async flush(): Promise<number> {
    if (this.running || Date.now() < this.aiOffUntil) return 0;
    const langs = [...this.queues.entries()].filter(([, q]) => q.size > 0).map(([l]) => l);
    if (langs.length === 0) return 0;
    const lang = langs[this.turn++ % langs.length];
    const q = this.queue(lang);
    this.running = true;
    try {
      const batch = [...q].slice(0, BATCH);
      batch.forEach((t) => q.delete(t));
      const texts: Record<string, string> = {};
      batch.forEach((t, i) => (texts[`t${i}`] = t.slice(0, MAX_CONTENT_TEXT)));
      const answer = await runAiText('TRANSLATE_CONTENT', { texts, target: lang });
      if (!answer.available || !answer.result) {
        // AI off or failing: retry later, without hammering it.
        this.aiOffUntil = Date.now() + 10 * 60_000;
        batch.forEach((t) => this.queuedCount() < QUEUE_LIMIT && q.add(t));
        return 0;
      }
      const items = Array.isArray((answer.result as { items?: unknown }).items)
        ? ((answer.result as { items: unknown[] }).items as Array<{ key?: unknown; en?: unknown }>)
        : [];
      let saved = 0;
      for (const item of items) {
        const idx = typeof item.key === 'string' && /^t\d+$/.test(item.key) ? Number(item.key.slice(1)) : -1;
        const source = batch[idx];
        const out = typeof item.en === 'string' ? item.en.trim().slice(0, MAX_CONTENT_TEXT * 2) : '';
        if (!source || !out || !keepsPlaceholders(source, out)) continue;
        const id = translationKey(lang, source);
        await this.prisma.contentTranslation.upsert({
          where: { id },
          create: { id, lang, source, en: out },
          update: { en: out },
        });
        saved++;
      }
      if (saved > 0) for (const k of [...this.dictCache.keys()]) if (k.startsWith(`${lang}:`)) this.dictCache.delete(k);
      return saved;
    } catch (e) {
      this.logger.warn(`translation batch failed: ${(e as Error).message.slice(0, 160)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  /** Queues partner texts without waiting for a request (e.g. right after a partner saves a menu). */
  enqueue(body: unknown) {
    const texts = [...collectContentTexts(body)];
    for (const lang of this.enabledLanguages()) this.enqueueTexts(lang, texts);
  }
}
