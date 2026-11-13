import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { formatCdf, INTERNAL_API_KEY, MOVA_EVENTS, RedisService, serviceUrl, type PaymentReminderPayload } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { fetchRidePaymentStatuses } from '../common/payment-status.util';
import { PlatformConfigService } from '../platform/platform-config.service';
import { UNPAID_FOLLOWUP_DEFAULTS, type UnpaidFollowupConfig } from '../platform/platform-config.types';

const TICK_MS = 5 * 60 * 1000;
const FOLLOWUP_SINCE = new Date(process.env.UNPAID_FOLLOWUP_SINCE ?? '2026-11-13T12:00:00Z');
const MIN = 60 * 1000;

export type UnpaidStep = 'UNPAID_REMINDER_1' | 'UNPAID_DRIVER_CHECK' | 'UNPAID_REMINDER_2' | 'UNPAID_AUTO_DISPUTE';

/** Follow-up steps after a ride ended unpaid (minutes after completion), from the admin settings. */
export function unpaidSteps(c: UnpaidFollowupConfig = UNPAID_FOLLOWUP_DEFAULTS): { event: UnpaidStep; afterMin: number }[] {
  const steps: { event: UnpaidStep; afterMin: number }[] = [
    { event: 'UNPAID_REMINDER_1', afterMin: c.reminder1Min },
    { event: 'UNPAID_DRIVER_CHECK', afterMin: c.driverCheckMin },
    { event: 'UNPAID_REMINDER_2', afterMin: c.reminder2Min },
  ];
  if (c.autoDisputeEnabled) steps.push({ event: 'UNPAID_AUTO_DISPUTE', afterMin: c.autoDisputeHours * 60 });
  return steps.sort((a, b) => a.afterMin - b.afterMin);
}

/** The next step due for a ride, given its age and the steps already done. */
export function nextUnpaidStep(
  ageMin: number,
  done: Set<string>,
  c: UnpaidFollowupConfig = UNPAID_FOLLOWUP_DEFAULTS,
): UnpaidStep | null {
  let due: UnpaidStep | null = null;
  for (const s of unpaidSteps(c)) {
    if (ageMin >= s.afterMin && !done.has(s.event)) due = s.event;
  }
  // Only the latest step due (a ride found late jumps straight to it, without a burst of messages).
  return due;
}

/**
 * Ride ended, nobody settled the payment: reminder to the passenger (5 min), question to the
 * driver (30 min), second reminder with SMS (2 h), then automatic cash dispute (24 h).
 * Stops as soon as the ride is paid, declared paid by the passenger, or disputed.
 */
@Injectable()
export class UnpaidFollowupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UnpaidFollowupScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private platformConfig: PlatformConfigService,
  ) {}

  onModuleInit() {
    if (process.env.UNPAID_FOLLOWUP_ENABLED === 'false') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // Settings may have been changed by the super-admin on another instance.
      await this.platformConfig.refresh().catch(() => undefined);
      const cfg = this.platformConfig.get().unpaidFollowup ?? UNPAID_FOLLOWUP_DEFAULTS;
      if (!cfg.enabled) return;
      const steps = unpaidSteps(cfg);
      const firstMin = steps[0]?.afterMin ?? 5;
      const lastMin = steps[steps.length - 1]?.afterMin ?? 24 * 60;
      const now = Date.now();
      const rides = await this.prisma.ride.findMany({
        where: {
          status: RideStatus.COMPLETED,
          isShared: false,
          testVoidedAt: null,
          // Never before the feature went live (no burst of reminders for old rides at deploy).
          completedAt: {
            gte: new Date(Math.max(now - (lastMin + 120) * MIN, FOLLOWUP_SINCE.getTime())),
            lte: new Date(now - firstMin * MIN),
          },
        },
        select: {
          id: true,
          passengerId: true,
          driverId: true,
          completedAt: true,
          finalFareCdf: true,
          estimatedFareCdf: true,
          pickupAddress: true,
          dropoffAddress: true,
          events: { where: { event: { startsWith: 'UNPAID_' } }, select: { event: true } },
        },
        take: 500,
      });
      if (rides.length === 0) return;
      const pays = await fetchRidePaymentStatuses(rides.map((r) => r.id)).catch(() => ({}) as Record<string, never>);
      for (const r of rides) {
        const pay = (pays as Record<string, { isPaid?: boolean; cashDisputed?: boolean; passengerClaimedPaid?: boolean }>)[r.id];
        if (!pay || pay.isPaid || pay.cashDisputed || pay.passengerClaimedPaid) continue;
        const ageMin = (now - (r.completedAt?.getTime() ?? now)) / MIN;
        const step = nextUnpaidStep(ageMin, new Set(r.events.map((e) => e.event)), cfg);
        if (!step) continue;
        await this.run(step, r).catch((e: unknown) =>
          this.logger.warn(`unpaid follow-up ${step} ride=${r.id}: ${e instanceof Error ? e.message : String(e)}`),
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async run(
    step: UnpaidStep,
    r: { id: string; passengerId: string; driverId: string | null; finalFareCdf: number | null; estimatedFareCdf: number | null; pickupAddress: string | null; dropoffAddress: string | null },
  ) {
    const amount = formatCdf(r.finalFareCdf ?? r.estimatedFareCdf ?? 0);
    const trip = `${r.pickupAddress ?? 'Départ'} → ${r.dropoffAddress ?? 'Arrivée'}`;
    const remind = (userId: string, title: string, body: string, kind: string, sms = false) =>
      this.redis.publish(MOVA_EVENTS.PAYMENT_REMINDER, {
        userId, title, body, kind, sms, rideId: r.id, referenceType: 'RIDE', referenceId: r.id,
      } satisfies PaymentReminderPayload);
    if (step === 'UNPAID_REMINDER_1' || step === 'UNPAID_REMINDER_2') {
      await remind(
        r.passengerId,
        'Course non réglée',
        `Votre course ${trip} (${amount}) n'est pas réglée. Payez-la, ou indiquez « J'ai payé en espèces » si vous avez déjà payé le chauffeur.`,
        'PASSENGER_REMINDER',
        step === 'UNPAID_REMINDER_2',
      );
    } else if (step === 'UNPAID_DRIVER_CHECK' && r.driverId) {
      await remind(
        r.driverId,
        'Le client a-t-il payé ?',
        `Course ${trip} (${amount}) : confirmez « Cash reçu » si le client vous a payé en espèces, ou « Cash non reçu » sinon.`,
        'DRIVER_CHECK',
      );
    } else if (step === 'UNPAID_AUTO_DISPUTE') {
      const res = await fetch(serviceUrl('payment', `/internal/rides/${r.id}/auto-dispute-unpaid`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) throw new Error(`auto-dispute HTTP ${res.status}`);
    }
    await this.prisma.rideEvent.create({ data: { rideId: r.id, event: step } });
  }
}
