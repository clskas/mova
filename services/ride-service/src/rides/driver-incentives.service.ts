import { Injectable, Logger } from '@nestjs/common';
import { DeliveryStatus, ErrandOrderStatus, RideStatus } from '@prisma/client';
import {
  bonusForJobs,
  formatCdf,
  INTERNAL_API_KEY,
  kinshasaClock,
  MOVA_EVENTS,
  RedisService,
  serviceUrl,
  type PaymentReminderPayload,
} from '@mova/shared';
import { PlatformConfigService } from '../platform/platform-config.service';
import { PrismaService } from '../prisma/prisma.service';

const CELL_DEG = 0.01;

/** Start and end of a Kinshasa day (YYYY-MM-DD). */
function dayRange(day: string): { from: Date; to: Date } {
  return { from: new Date(`${day}T00:00:00+01:00`), to: new Date(`${day}T23:59:59.999+01:00`) };
}

/** Group requests into ~1 km cells (pure, tested). */
export function heatCells(points: { lat: number; lng: number; waiting: boolean }[]) {
  const cells = new Map<string, { lat: number; lng: number; count: number; waiting: number }>();
  for (const p of points) {
    const la = Math.round(p.lat / CELL_DEG) * CELL_DEG;
    const ln = Math.round(p.lng / CELL_DEG) * CELL_DEG;
    const key = `${la.toFixed(2)}:${ln.toFixed(2)}`;
    const c = cells.get(key) ?? { lat: Number(la.toFixed(4)), lng: Number(ln.toFixed(4)), count: 0, waiting: 0 };
    c.count++;
    if (p.waiting) c.waiting++;
    cells.set(key, c);
  }
  return [...cells.values()].sort((a, b) => b.waiting - a.waiting || b.count - a.count);
}

/**
 * Driver incentives (Admin → Automatisations): daily bonus for reaching N jobs, the demand
 * map, and the referral rewards (a first ride or delivery finished by the new user).
 */
@Injectable()
export class DriverIncentivesService {
  private readonly logger = new Logger(DriverIncentivesService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private platformConfig: PlatformConfigService,
  ) {}

  /** Rides + deliveries + errands finished by this driver on that Kinshasa day. */
  async jobsOn(driverId: string, day: string): Promise<number> {
    const { from, to } = dayRange(day);
    const [rides, deliveries, errands] = await Promise.all([
      this.prisma.ride.count({ where: { driverId, status: RideStatus.COMPLETED, completedAt: { gte: from, lte: to }, testVoidedAt: null } }),
      this.prisma.delivery.count({ where: { driverId, status: DeliveryStatus.DELIVERED, deliveredAt: { gte: from, lte: to }, testVoidedAt: null } }),
      this.prisma.errandOrder.count({ where: { driverId, status: ErrandOrderStatus.COMPLETED, completedAt: { gte: from, lte: to }, testVoidedAt: null } }),
    ]);
    return rides + deliveries + errands;
  }

  /** What the driver app shows: today's jobs and the bonus tiers. */
  async bonusProgress(driverId: string) {
    const b = this.platformConfig.get().automations.driverBonus;
    const today = kinshasaClock().day;
    const jobs = b.enabled ? await this.jobsOn(driverId, today) : 0;
    return {
      enabled: b.enabled,
      todayJobs: jobs,
      tiers: [
        { jobs: b.minJobs, bonusCdf: b.bonusCdf },
        ...(b.minJobs2 > 0 ? [{ jobs: b.minJobs2, bonusCdf: b.bonus2Cdf }] : []),
      ],
      earnedCdf: bonusForJobs(jobs, b),
    };
  }

  private async bonus(userId: string, amountCdf: number, description: string, reference: string) {
    const res = await fetch(serviceUrl('payment', `/internal/wallets/${userId}/platform-bonus`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify({ amountCdf, description, reference }),
    });
    if (!res.ok) throw new Error(`platform-bonus HTTP ${res.status}`);
    return (await res.json()) as { granted?: boolean };
  }

  private async tell(userId: string, title: string, body: string) {
    await this.redis.publish(MOVA_EVENTS.PAYMENT_REMINDER, {
      userId, title, body, kind: 'BONUS', sms: false,
    } satisfies PaymentReminderPayload).catch(() => undefined);
  }

  /** Pays yesterday's daily bonuses (once per driver and day). */
  async payDailyBonuses(yesterday: string) {
    const b = this.platformConfig.get().automations.driverBonus;
    if (!b.enabled) return 0;
    const { from, to } = dayRange(yesterday);
    const [rides, deliveries, errands] = await Promise.all([
      this.prisma.ride.groupBy({ by: ['driverId'], where: { status: RideStatus.COMPLETED, completedAt: { gte: from, lte: to }, testVoidedAt: null, driverId: { not: null } }, _count: { _all: true } }),
      this.prisma.delivery.groupBy({ by: ['driverId'], where: { status: DeliveryStatus.DELIVERED, deliveredAt: { gte: from, lte: to }, testVoidedAt: null, driverId: { not: null } }, _count: { _all: true } }),
      this.prisma.errandOrder.groupBy({ by: ['driverId'], where: { status: ErrandOrderStatus.COMPLETED, completedAt: { gte: from, lte: to }, testVoidedAt: null, driverId: { not: null } }, _count: { _all: true } }),
    ]);
    const jobs = new Map<string, number>();
    for (const row of [...rides, ...deliveries, ...errands]) {
      if (!row.driverId) continue;
      jobs.set(row.driverId, (jobs.get(row.driverId) ?? 0) + row._count._all);
    }
    let paid = 0;
    for (const [driverId, n] of jobs) {
      const amount = bonusForJobs(n, b);
      if (amount <= 0) continue;
      const res = await this.bonus(driverId, amount, `Bonus du ${yesterday} (${n} missions)`, `BONUS_DAILY:${driverId}:${yesterday}`).catch((e: unknown) => {
        this.logger.warn(`daily bonus ${driverId}: ${String(e)}`);
        return null;
      });
      if (res?.granted) {
        paid++;
        await this.tell(driverId, 'Bonus SENGA', `Bravo : ${n} missions hier. ${formatCdf(amount)} ont été ajoutés à votre portefeuille.`);
      }
    }
    return paid;
  }

  /** Demand around a point: requests of the last N minutes in ~1 km cells. */
  async heatmap(lat: number, lng: number) {
    const h = this.platformConfig.get().automations.demandHeatmap;
    if (!h.enabled || !Number.isFinite(lat) || !Number.isFinite(lng)) return { enabled: h.enabled, cells: [] };
    const since = new Date(Date.now() - h.windowMinutes * 60 * 1000);
    const box = 0.15; // ~15 km
    const [rides, deliveries] = await Promise.all([
      this.prisma.ride.findMany({
        where: { createdAt: { gte: since }, testVoidedAt: null, pickupLat: { gte: lat - box, lte: lat + box }, pickupLng: { gte: lng - box, lte: lng + box } },
        select: { pickupLat: true, pickupLng: true, status: true },
        take: 3000,
      }),
      this.prisma.delivery.findMany({
        where: { createdAt: { gte: since }, testVoidedAt: null, pickupLat: { gte: lat - box, lte: lat + box }, pickupLng: { gte: lng - box, lte: lng + box } },
        select: { pickupLat: true, pickupLng: true, status: true },
        take: 3000,
      }),
    ]);
    const points = [
      ...rides.map((r) => ({ lat: r.pickupLat, lng: r.pickupLng, waiting: r.status === RideStatus.REQUESTED || r.status === RideStatus.SEARCHING })),
      ...deliveries.map((d) => ({ lat: d.pickupLat, lng: d.pickupLng, waiting: d.status === DeliveryStatus.PENDING })),
    ];
    return { enabled: true, windowMinutes: h.windowMinutes, cells: heatCells(points).slice(0, 60) };
  }

  /** Pays the referral rewards whose new user finished a first ride or delivery. */
  async payReferrals() {
    const r = this.platformConfig.get().automations.referral;
    if (!r.enabled) return 0;
    const res = await fetch(serviceUrl('auth', `/internal/referrals/pending?max=${r.maxPerReferrer}`), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) return 0;
    const { items } = (await res.json()) as { items: { userId: string; referrerId: string }[] };
    let paid = 0;
    for (const it of items ?? []) {
      const done =
        (await this.prisma.ride.count({ where: { status: RideStatus.COMPLETED, testVoidedAt: null, OR: [{ passengerId: it.userId }, { driverId: it.userId }] } })) +
        (await this.prisma.delivery.count({ where: { status: DeliveryStatus.DELIVERED, testVoidedAt: null, OR: [{ userId: it.userId }, { driverId: it.userId }] } }));
      if (done === 0) continue;
      try {
        if (r.refereeRewardCdf > 0) {
          await this.bonus(it.userId, r.refereeRewardCdf, 'Parrainage SENGA : bienvenue', `REFERRAL:${it.userId}:referee`);
          await this.tell(it.userId, 'Parrainage SENGA', `${formatCdf(r.refereeRewardCdf)} offerts sur votre portefeuille. Merci d’utiliser SENGA !`);
        }
        if (r.referrerRewardCdf > 0) {
          await this.bonus(it.referrerId, r.referrerRewardCdf, 'Parrainage SENGA : filleul actif', `REFERRAL:${it.userId}:referrer`);
          await this.tell(it.referrerId, 'Parrainage SENGA', `Votre filleul a fait sa première course : ${formatCdf(r.referrerRewardCdf)} ajoutés à votre portefeuille.`);
        }
        await fetch(serviceUrl('auth', `/internal/referrals/${it.userId}/rewarded`), {
          method: 'POST',
          headers: { 'x-internal-api-key': INTERNAL_API_KEY },
        });
        paid++;
      } catch (e) {
        this.logger.warn(`referral ${it.userId}: ${String(e)}`);
      }
    }
    return paid;
  }
}
