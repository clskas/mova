import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CashDebtStatus } from '@prisma/client';
import { fetchAutomations, formatCdf, kinshasaClock, MOVA_EVENTS, RedisService, type PaymentReminderPayload } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

const TICK_MS = 30 * 60 * 1000;

/**
 * Cash owed at the counter: once a day (late morning) a reminder to every driver whose oldest
 * open debt is older than the delay set in Admin → Automatisations, with the amount and, when
 * set, the day offers stop.
 */
@Injectable()
export class CashDebtFollowupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CashDebtFollowupScheduler.name);
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
    const cfg = (await fetchAutomations()).cashDebt;
    if (!cfg.enabled) return;
    const clock = kinshasaClock();
    if (clock.hour < 10 || clock.hour > 12) return;
    const cutoff = new Date(Date.now() - cfg.remindAfterHours * 3600 * 1000);
    const debts = await this.prisma.driverCashDebt.groupBy({
      by: ['driverUserId'],
      where: { status: CashDebtStatus.OPEN, createdAt: { lte: cutoff } },
      _sum: { amountCdf: true },
      _min: { createdAt: true },
    });
    for (const d of debts) {
      const key = `auto:cashdebt:${d.driverUserId}:${clock.day}`;
      const first = await this.redis.client.set(key, '1', 'EX', 30 * 3600, 'NX').catch(() => null);
      if (first !== 'OK') continue;
      const total = await this.prisma.driverCashDebt.aggregate({
        where: { driverUserId: d.driverUserId, status: CashDebtStatus.OPEN },
        _sum: { amountCdf: true },
      });
      const amount = formatCdf(total._sum.amountCdf ?? d._sum.amountCdf ?? 0);
      let block = '';
      if (cfg.blockAfterDays > 0 && d._min.createdAt) {
        const until = new Date(d._min.createdAt.getTime() + cfg.blockAfterDays * 24 * 3600 * 1000);
        block =
          until.getTime() > Date.now()
            ? ` Sans règlement avant le ${until.toLocaleDateString('fr-FR', { timeZone: 'Africa/Kinshasa' })}, vous ne recevrez plus de missions.`
            : ' Vos missions sont suspendues jusqu’au règlement.';
      }
      await this.redis.publish(MOVA_EVENTS.PAYMENT_REMINDER, {
        userId: d.driverUserId,
        title: 'Espèces à régler au guichet',
        body: `Vous devez ${amount} à SENGA (commissions sur des courses payées en espèces). Réglez-les au guichet ou par Mobile Money depuis votre portefeuille.${block}`,
        kind: 'CASH_DEBT',
        sms: true,
      } satisfies PaymentReminderPayload);
    }
  }
}
