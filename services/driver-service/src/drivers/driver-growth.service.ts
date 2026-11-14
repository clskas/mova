import { Body, Controller, Injectable, Logger, OnModuleDestroy, OnModuleInit, Post, UseGuards } from '@nestjs/common';
import { KycStatus } from '@prisma/client';
import { fetchAutomations, kinshasaClock, MOVA_EVENTS, RedisService, type PaymentReminderPayload } from '@mova/shared';
import { InternalApiGuard } from '../common/internal-api.guard';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 24 * 3600 * 1000;

/**
 * Driver automations (Admin → Automatisations): messages to the drivers of a city
 * (callouts, rain) and reminders for unfinished driver files.
 */
@Injectable()
export class DriverGrowthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriverGrowthService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private prisma: PrismaService, private redis: RedisService) {}

  onModuleInit() {
    if (process.env.AUTOMATIONS_DISABLED === 'true' || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.onboardingReminders().catch((e: unknown) => this.logger.warn(String(e))), 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tell(userId: string, title: string, body: string, sms = false) {
    await this.redis
      .publish(MOVA_EVENTS.PAYMENT_REMINDER, { userId, title, body, kind: 'AUTOMATION', sms } satisfies PaymentReminderPayload)
      .catch(() => undefined);
  }

  /** Approved drivers of a city (optionally only those offline) get a message. */
  async notifyCity(city: string, title: string, body: string, onlyOffline: boolean) {
    const drivers = await this.prisma.driverProfile.findMany({
      where: {
        operatingCity: { equals: city, mode: 'insensitive' },
        kycStatus: KycStatus.APPROVED,
        qualityBlockedAt: null,
        ...(onlyOffline ? { isAvailable: false } : {}),
      },
      select: { userId: true },
      take: 2000,
    });
    for (const d of drivers) await this.tell(d.userId, title, body);
    return { notified: drivers.length };
  }

  /** Files not approved yet: reminder every N days, at most M times (mornings). */
  async onboardingReminders() {
    const cfg = (await fetchAutomations()).onboardingReminders;
    if (!cfg.enabled) return;
    const clock = kinshasaClock();
    if (clock.hour !== 10) return;
    const profiles = await this.prisma.driverProfile.findMany({
      where: { kycStatus: { in: [KycStatus.PENDING, KycStatus.REJECTED] }, createdAt: { lte: new Date(Date.now() - DAY) } },
      select: { userId: true, kycStatus: true },
      take: 3000,
    });
    for (const p of profiles) {
      const countKey = `auto:onboarding:count:${p.userId}`;
      const sent = Number(await this.redis.client.get(countKey).catch(() => null)) || 0;
      if (sent >= cfg.maxReminders) continue;
      const ok = (await this.redis.client.set(`auto:onboarding:last:${p.userId}`, '1', 'EX', cfg.everyDays * 24 * 3600, 'NX').catch(() => null)) === 'OK';
      if (!ok) continue;
      await this.redis.client.set(countKey, String(sent + 1), 'EX', 120 * 24 * 3600).catch(() => undefined);
      await this.tell(
        p.userId,
        'Terminez votre inscription SENGA Driver',
        p.kycStatus === KycStatus.REJECTED
          ? 'Un document a été refusé : envoyez-en un nouveau dans SENGA Driver pour commencer à gagner de l’argent.'
          : 'Il manque des documents (permis, photo, véhicule) : complétez votre dossier dans SENGA Driver pour recevoir des courses.',
        sent === 1,
      );
    }
  }
}

@Controller('internal/drivers')
@UseGuards(InternalApiGuard)
export class DriverGrowthInternalController {
  constructor(private growth: DriverGrowthService) {}

  @Post('notify-city')
  notifyCity(@Body() body: { city?: string; title?: string; body?: string; onlyOffline?: boolean }) {
    const city = String(body?.city ?? '').trim();
    if (!city) return { notified: 0 };
    return this.growth.notifyCity(city, String(body?.title ?? 'SENGA Driver').slice(0, 80), String(body?.body ?? '').slice(0, 300), body?.onlyOffline === true);
  }
}
