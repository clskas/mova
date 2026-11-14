import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { fetchAutomations, kinshasaClock, MOVA_EVENTS, RedisService, type PaymentReminderPayload } from '@mova/shared';
import { SubscriptionsService } from './subscriptions.service';

const TICK_MS = 60 * 60 * 1000;

/** SENGA Plus renewals and reminders, once a day at 10 h (Kinshasa), when switched on. */
@Injectable()
export class SubscriptionRenewalScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionRenewalScheduler.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private subscriptions: SubscriptionsService, private redis: RedisService) {}

  onModuleInit() {
    if (process.env.AUTOMATIONS_DISABLED === 'true') return;
    this.timer = setInterval(() => void this.tick().catch((e: unknown) => this.logger.warn(String(e))), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    const cfg = (await fetchAutomations()).subscriptions;
    if (!cfg.enabled) return;
    const clock = kinshasaClock();
    if (clock.hour !== 10) return;
    const first = await this.redis.client.set(`auto:subs:${clock.day}`, '1', 'EX', 30 * 3600, 'NX').catch(() => null);
    if (first !== 'OK') return;
    await this.subscriptions.renewDue(cfg, async (userId, title, body) => {
      await this.redis.publish(MOVA_EVENTS.PAYMENT_REMINDER, { userId, title, body, kind: 'SUBSCRIPTION', sms: false } satisfies PaymentReminderPayload);
    });
  }
}
