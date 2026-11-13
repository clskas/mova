import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { formatCdf, INTERNAL_API_KEY, MOVA_EVENTS, RedisService, serviceUrl, type PaymentReminderPayload } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { fetchRidePaymentStatuses } from '../common/payment-status.util';

const TICK_MS = 5 * 60 * 1000;
const FOLLOWUP_SINCE = new Date(process.env.UNPAID_FOLLOWUP_SINCE ?? '2026-11-13T12:00:00Z');
const MIN = 60 * 1000;

/** Follow-up steps after a ride ended unpaid (minutes after completion). */
export const UNPAID_STEPS = [
  { event: 'UNPAID_REMINDER_1', afterMin: 5 },
  { event: 'UNPAID_DRIVER_CHECK', afterMin: 30 },
  { event: 'UNPAID_REMINDER_2', afterMin: 120 },
  { event: 'UNPAID_AUTO_DISPUTE', afterMin: 24 * 60 },
] as const;

export type UnpaidStep = (typeof UNPAID_STEPS)[number]['event'];

/** The next step due for a ride, given its age and the steps already done. */
export function nextUnpaidStep(ageMin: number, done: Set<string>): UnpaidStep | null {
  let due: UnpaidStep | null = null;
  for (const s of UNPAID_STEPS) {
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

  constructor(private prisma: PrismaService, private redis: RedisService) {}

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
      const now = Date.now();
      const rides = await this.prisma.ride.findMany({
        where: {
          status: RideStatus.COMPLETED,
          isShared: false,
          testVoidedAt: null,
          // Never before the feature went live (no burst of reminders for old rides at deploy).
          completedAt: {
            gte: new Date(Math.max(now - 26 * 60 * MIN, FOLLOWUP_SINCE.getTime())),
            lte: new Date(now - 5 * MIN),
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
        const step = nextUnpaidStep(ageMin, new Set(r.events.map((e) => e.event)));
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
