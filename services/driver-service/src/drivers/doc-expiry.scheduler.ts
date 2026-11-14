import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { fetchAutomations, kinshasaClock, MOVA_EVENTS, RedisService, type PaymentReminderPayload } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

const TICK_MS = 30 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const FIELDS = [
  { key: 'licenseExpiry', label: 'permis de conduire' },
  { key: 'insuranceExpiry', label: 'assurance' },
  { key: 'technicalInspectionExpiry', label: 'contrôle technique' },
  { key: 'fiscalStickerExpiry', label: 'vignette' },
] as const;

/** Days left before an expiry, rounded down (pure, tested). */
export function daysLeft(expiry: Date, now: Date): number {
  return Math.floor((expiry.getTime() - now.getTime()) / DAY);
}

/**
 * Driver documents about to expire: a reminder 30, 7 and 1 days before (set in Admin →
 * Automatisations), by notification, and also by SMS from 7 days. Once per document and step.
 */
@Injectable()
export class DocExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocExpiryScheduler.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private prisma: PrismaService, private redis: RedisService) {}

  onModuleInit() {
    if (process.env.AUTOMATIONS_DISABLED === 'true') return;
    this.timer = setInterval(() => void this.tick().catch((e: unknown) => this.logger.warn(String(e))), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    const cfg = (await fetchAutomations()).docExpiry;
    if (!cfg.enabled || !cfg.daysBefore.length) return;
    // Mornings only (9 h – 11 h Kinshasa): no SMS at night.
    const hour = kinshasaClock().hour;
    if (hour < 9 || hour > 11) return;
    const now = new Date();
    const horizon = new Date(now.getTime() + (Math.max(...cfg.daysBefore) + 1) * DAY);
    const drivers = await this.prisma.driverProfile.findMany({
      where: {
        OR: FIELDS.map((f) => ({ [f.key]: { gte: now, lte: horizon } })),
      },
      select: { userId: true, licenseExpiry: true, insuranceExpiry: true, technicalInspectionExpiry: true, fiscalStickerExpiry: true },
      take: 2000,
    });
    for (const d of drivers) {
      for (const f of FIELDS) {
        const expiry = d[f.key];
        if (!expiry) continue;
        const left = daysLeft(expiry, now);
        const step = cfg.daysBefore.find((s) => left <= s && left > (cfg.daysBefore.find((x) => x < s) ?? -1));
        if (step == null) continue;
        const key = `auto:docexp:${d.userId}:${f.key}:${expiry.toISOString().slice(0, 10)}:${step}`;
        const first = await this.redis.client.set(key, '1', 'EX', 100 * 24 * 3600, 'NX').catch(() => null);
        if (first !== 'OK') continue;
        const when = expiry.toLocaleDateString('fr-FR', { timeZone: 'Africa/Kinshasa' });
        await this.redis.publish(MOVA_EVENTS.PAYMENT_REMINDER, {
          userId: d.userId,
          title: `Votre ${f.label} expire bientôt`,
          body: `Votre ${f.label} expire le ${when}. Renouvelez-le et envoyez le nouveau document dans SENGA Driver (Mes documents) pour continuer à recevoir des missions.`,
          kind: 'DOC_EXPIRY',
          sms: step <= 7,
        } satisfies PaymentReminderPayload);
      }
    }
  }
}
