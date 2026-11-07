import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runAiText } from '../common/ai-vision.util';
import { MAX_CONTENT_TEXT, applyContentTranslations, collectContentTexts, sourceKey } from './content-translation.util';

const BATCH = 40;
const QUEUE_LIMIT = 2000;
const WORKER_MS = 20_000;

/**
 * English versions of partner texts (menus, listings, ads), translated once by Claude and cached.
 * A text seen for the first time is shown in French and queued; the next request gets English.
 */
@Injectable()
export class ContentTranslationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentTranslationService.name);
  private readonly queue = new Set<string>();
  private timer?: NodeJS.Timeout;
  private running = false;
  private aiOffUntil = 0;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.CONTENT_TRANSLATION === 'false') return;
    this.timer = setInterval(() => void this.flush(), WORKER_MS);
    this.timer.unref?.();
    // Warm-up: queue the live catalogues once, so English users rarely see French first.
    const warm = setTimeout(() => void this.warmUp(), 60_000);
    warm.unref?.();
  }

  private async warmUp() {
    try {
      const [restaurants, vehicles, ads] = await Promise.all([
        this.prisma.restaurant.findMany({
          where: { isActive: true },
          select: { name: true, cuisine: true, promotionLabel: true, menuItems: true },
          take: 300,
        }),
        this.prisma.rentalVehicle.findMany({
          where: { isActive: true },
          select: { name: true, category: true, description: true, dailyRateCdf: true },
          take: 500,
        }),
        this.prisma.publicite.findMany({ where: { isActive: true }, select: { titre: true, description: true }, take: 100 }),
      ]);
      const texts = [...collectContentTexts([restaurants, vehicles, ads])];
      if (texts.length === 0) return;
      const known = new Set(
        (
          await this.prisma.contentTranslation.findMany({
            where: { id: { in: texts.map(sourceKey) } },
            select: { source: true },
          })
        ).map((r) => r.source),
      );
      for (const t of texts) if (!known.has(t) && this.queue.size < QUEUE_LIMIT) this.queue.add(t);
      this.logger.log(`content translation warm-up: ${this.queue.size} text(s) queued`);
    } catch (e) {
      this.logger.warn(`content translation warm-up skipped: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Translates the partner texts of a response body for an English-speaking user. */
  async translateBody<T>(body: T): Promise<T> {
    const texts = [...collectContentTexts(body)];
    if (texts.length === 0) return body;
    const dict = new Map<string, string>();
    try {
      const rows = await this.prisma.contentTranslation.findMany({
        where: { id: { in: texts.map(sourceKey) } },
        select: { source: true, en: true },
      });
      for (const r of rows) dict.set(r.source, r.en);
    } catch (e) {
      this.logger.warn(`content translation lookup failed: ${(e as Error).message.slice(0, 160)}`);
      return body;
    }
    for (const t of texts) {
      if (!dict.has(t) && this.queue.size < QUEUE_LIMIT) this.queue.add(t);
    }
    return applyContentTranslations(body, dict) as T;
  }

  /** Background: translate queued texts in small batches. */
  async flush(): Promise<number> {
    if (this.running || this.queue.size === 0 || Date.now() < this.aiOffUntil) return 0;
    this.running = true;
    try {
      const batch = [...this.queue].slice(0, BATCH);
      batch.forEach((t) => this.queue.delete(t));
      const texts: Record<string, string> = {};
      batch.forEach((t, i) => (texts[`t${i}`] = t.slice(0, MAX_CONTENT_TEXT)));
      const answer = await runAiText('TRANSLATE_CONTENT', { texts });
      if (!answer.available || !answer.result) {
        // AI off or failing: retry later, without hammering it.
        this.aiOffUntil = Date.now() + 10 * 60_000;
        batch.forEach((t) => this.queue.size < QUEUE_LIMIT && this.queue.add(t));
        return 0;
      }
      const items = Array.isArray((answer.result as { items?: unknown }).items)
        ? ((answer.result as { items: unknown[] }).items as Array<{ key?: unknown; en?: unknown }>)
        : [];
      let saved = 0;
      for (const item of items) {
        const idx = typeof item.key === 'string' && /^t\d+$/.test(item.key) ? Number(item.key.slice(1)) : -1;
        const source = batch[idx];
        const en = typeof item.en === 'string' ? item.en.trim().slice(0, MAX_CONTENT_TEXT * 2) : '';
        if (!source || !en) continue;
        await this.prisma.contentTranslation.upsert({
          where: { id: sourceKey(source) },
          create: { id: sourceKey(source), source, en },
          update: { en },
        });
        saved++;
      }
      return saved;
    } catch (e) {
      this.logger.warn(`content translation batch failed: ${(e as Error).message.slice(0, 160)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  /** Queues texts without waiting for a request (e.g. right after a partner saves a menu). */
  enqueue(body: unknown) {
    for (const t of collectContentTexts(body)) if (this.queue.size < QUEUE_LIMIT) this.queue.add(t);
  }
}
