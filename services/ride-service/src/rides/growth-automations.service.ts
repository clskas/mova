import { Injectable, Logger } from '@nestjs/common';
import { Prisma, RideStatus } from '@prisma/client';
import {
  DRC_SERVICE_AREAS,
  INTERNAL_API_KEY,
  MOVA_EVENTS,
  RedisService,
  formatCdf,
  kinshasaClock,
  maintenanceMilestone,
  postStaffAlert,
  resolveCityFromCoords,
  serviceUrl,
  type PaymentReminderPayload,
} from '@mova/shared';
import { PlatformConfigService } from '../platform/platform-config.service';
import { PrismaService } from '../prisma/prisma.service';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

/** Rain forecast multiplier stored per city (read by the price estimate). */
export const rainSurgeKey = (city: string) => `surge:rain:${city.toLowerCase()}`;
/** Price looked at by a passenger (abandoned booking reminder). */
export const ESTIMATE_PENDING_KEY = 'auto:estimates:pending';

/**
 * Automations lot 6 run by ride-service (Admin → Automatisations): rescue of rides without a
 * driver, driver callouts, reminders, rain / events, fraud signals, apology credits,
 * low-rating tickets, win-back and maintenance reminders. Each one has its switch.
 */
@Injectable()
export class GrowthAutomationsService {
  private readonly logger = new Logger(GrowthAutomationsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private platformConfig: PlatformConfigService,
  ) {}

  private get cfg() {
    return this.platformConfig.get().automations;
  }

  private async once(key: string, ttlSec: number): Promise<boolean> {
    try {
      return (await this.redis.client.set(key, '1', 'EX', ttlSec, 'NX')) === 'OK';
    } catch {
      return false;
    }
  }

  private async tell(userId: string, title: string, body: string, sms = false) {
    await this.redis
      .publish(MOVA_EVENTS.PAYMENT_REMINDER, { userId, title, body, kind: 'AUTOMATION', sms } satisfies PaymentReminderPayload)
      .catch(() => undefined);
  }

  private async bonus(userId: string, amountCdf: number, description: string, reference: string) {
    const res = await fetch(serviceUrl('payment', `/internal/wallets/${userId}/platform-bonus`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify({ amountCdf, description, reference }),
    });
    if (!res.ok) throw new Error(`platform-bonus HTTP ${res.status}`);
  }

  private async notifyCity(city: string, title: string, body: string, onlyOffline: boolean) {
    await fetch(serviceUrl('driver', '/internal/drivers/notify-city'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify({ city, title, body, onlyOffline }),
    }).catch(() => undefined);
  }

  /** Called by the estimate: remember the price a logged-in passenger looked at. */
  async rememberEstimate(passengerId: string) {
    if (!this.cfg.abandonedBooking.enabled) return;
    await this.redis.client.zadd(ESTIMATE_PENDING_KEY, Date.now(), passengerId).catch(() => undefined);
  }

  /** Every 10 minutes. */
  async tick() {
    const a = this.cfg;
    const run = async (name: string, on: boolean, fn: () => Promise<unknown>) => {
      if (!on) return;
      await fn().catch((e: unknown) => this.logger.warn(`${name}: ${String(e)}`));
    };
    const clock = kinshasaClock();
    await run('rescue', a.rideRescue.enabled, () => this.rescue());
    await run('callout', a.driverCallout.enabled, () => this.callout());
    await run('abandoned', a.abandonedBooking.enabled, () => this.abandoned());
    await run('weather', a.weatherEvents.enabled, () => this.weather());
    await run('compensation', a.autoCompensation.enabled, () => this.compensation());
    await run('low-rating', a.lowRatingTicket.enabled, () => this.lowRatings());
    if (clock.hour === 10 && (await this.once(`auto:winback:${clock.day}`, 36 * 3600))) {
      await run('win-back', a.winBack.enabled, () => this.winBack());
    }
    if (clock.hour === 5 && (await this.once(`auto:fraud:${clock.day}`, 36 * 3600))) {
      await run('fraud', a.fraudWatch.enabled, () => this.fraud());
    }
    if (clock.hour === 7 && (await this.once(`auto:maintenance:${clock.day}`, 36 * 3600))) {
      await run('maintenance', a.maintenanceReminder.enabled, () => this.maintenance());
    }
  }

  // 1. Rides without a driver after N minutes: tips + optional SENGA pickup bonus.
  private async rescue() {
    const c = this.cfg.rideRescue;
    const since = new Date(Date.now() - 30 * MIN);
    const before = new Date(Date.now() - c.afterMinutes * MIN);
    const rides = await this.prisma.ride.findMany({
      where: { status: { in: [RideStatus.REQUESTED, RideStatus.SEARCHING] }, createdAt: { gte: since, lte: before }, testVoidedAt: null },
      select: { id: true, passengerId: true, vehicleType: true },
      take: 200,
    });
    for (const r of rides) {
      if (!(await this.once(`auto:rescue:${r.id}`, 2 * 3600))) continue;
      const moto = r.vehicleType !== 'MOTO_TAXI' ? ' Essayez la moto-taxi,' : '';
      const raise = this.cfg.priceOffer.enabled ? ' ou augmentez votre prix,' : '';
      await this.tell(r.passengerId, 'Nous cherchons encore', `Pas encore de chauffeur.${moto}${raise} nous continuons à chercher.`);
      if (c.bonusCdf > 0) {
        await this.redis.client.setex(`ride:rescue-bonus:${r.id}`, 6 * 3600, String(c.bonusCdf)).catch(() => undefined);
      }
    }
    // Pay the pickup bonus to the driver once the rescued ride is finished.
    const done = await this.prisma.ride.findMany({
      where: { status: RideStatus.COMPLETED, updatedAt: { gte: new Date(Date.now() - 6 * 3600 * 1000) }, driverId: { not: null } },
      select: { id: true, driverId: true },
      take: 500,
    });
    for (const r of done) {
      const amount = Number(await this.redis.client.get(`ride:rescue-bonus:${r.id}`).catch(() => null)) || 0;
      if (amount <= 0 || !r.driverId) continue;
      await this.bonus(r.driverId, amount, `Prime SENGA : course sans chauffeur prise en charge ${r.id.slice(0, 8)}`, `RESCUE:${r.id}`);
      await this.redis.client.del(`ride:rescue-bonus:${r.id}`).catch(() => undefined);
      await this.tell(r.driverId, 'Prime SENGA reçue', `${formatCdf(amount)} pour avoir pris une course qui attendait.`);
    }
  }

  // 2. Many passengers waiting in a city: offline drivers there are called (once per hour).
  private async callout() {
    const rides = await this.prisma.ride.findMany({
      where: { status: { in: [RideStatus.REQUESTED, RideStatus.SEARCHING] }, createdAt: { gte: new Date(Date.now() - 20 * MIN) }, testVoidedAt: null },
      select: { pickupLat: true, pickupLng: true },
      take: 2000,
    });
    const byCity = new Map<string, number>();
    for (const r of rides) {
      const city = resolveCityFromCoords(r.pickupLat, r.pickupLng);
      if (city) byCity.set(city, (byCity.get(city) ?? 0) + 1);
    }
    const hour = Math.floor(Date.now() / 3_600_000);
    for (const [city, n] of byCity) {
      if (n < this.cfg.driverCallout.minWaiting) continue;
      if (!(await this.once(`auto:callout:${city}:${hour}`, 2 * 3600))) continue;
      await this.notifyCity(city, 'Des clients vous attendent', `${n} clients attendent un chauffeur à ${city}. Connectez-vous à SENGA Driver.`, true);
    }
  }

  // 3. Price looked at, no order after N minutes: one reminder a day.
  private async abandoned() {
    const limit = Date.now() - this.cfg.abandonedBooking.afterMinutes * MIN;
    const due = await this.redis.client.zrangebyscore(ESTIMATE_PENDING_KEY, 0, limit, 'LIMIT', 0, 300).catch(() => [] as string[]);
    for (const pid of due) {
      const at = Number(await this.redis.client.zscore(ESTIMATE_PENDING_KEY, pid).catch(() => 0)) || 0;
      await this.redis.client.zrem(ESTIMATE_PENDING_KEY, pid).catch(() => undefined);
      if (!at || Date.now() - at > 2 * 3600 * 1000) continue;
      const ordered = await this.prisma.ride.count({ where: { passengerId: pid, createdAt: { gte: new Date(at - MIN) } } });
      if (ordered > 0) continue;
      if (!(await this.once(`auto:abandoned:${pid}:${kinshasaClock().day}`, 36 * 3600))) continue;
      await this.tell(pid, 'Votre course vous attend', 'Votre trajet est toujours disponible sur SENGA. Commandez en un instant.');
    }
  }

  // 6. Rain in the next hours: price boost (read by the estimate) and drivers warned.
  private async weather() {
    const c = this.cfg.weatherEvents;
    const active = await this.prisma.ride.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 7 * DAY) } },
      select: { pickupLat: true, pickupLng: true },
      distinct: ['pickupLat'],
      take: 3000,
    });
    const cityNames = new Set(active.map((r) => resolveCityFromCoords(r.pickupLat, r.pickupLng)).filter(Boolean));
    const areas = DRC_SERVICE_AREAS.filter((a) => cityNames.has(a.name)).slice(0, 40);
    if (!areas.length) return;
    const url =
      'https://api.open-meteo.com/v1/forecast?hourly=precipitation&forecast_hours=2&timezone=Africa%2FKinshasa' +
      `&latitude=${areas.map((a) => a.centerLat.toFixed(3)).join(',')}&longitude=${areas.map((a) => a.centerLng.toFixed(3)).join(',')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    const list = (Array.isArray(body) ? body : [body]) as Array<{ hourly?: { precipitation?: number[] } }>;
    for (let i = 0; i < areas.length; i++) {
      const mm = Math.max(0, ...(list[i]?.hourly?.precipitation ?? [0]));
      const city = areas[i].name;
      if (mm >= c.rainMm) {
        await this.redis.client.setex(rainSurgeKey(city), 75 * 60, String(c.rainMultiplier)).catch(() => undefined);
        if (await this.once(`auto:rain:${city}:${Math.floor(Date.now() / (3 * 3_600_000))}`, 4 * 3600)) {
          await this.notifyCity(city, 'Pluie annoncée', `Pluie prévue à ${city} : forte demande attendue. Connectez-vous pour gagner plus.`, false);
        }
      }
    }
  }

  // 10. Driver cancelled after the passenger waited N minutes: apology credit (once per ride).
  private async compensation() {
    const c = this.cfg.autoCompensation;
    const rides = await this.prisma.ride.findMany({
      where: { status: RideStatus.CANCELLED, cancelledAt: { gte: new Date(Date.now() - 30 * MIN) }, acceptedAt: { not: null }, testVoidedAt: null },
      select: { id: true, passengerId: true, driverId: true, cancelledBy: true, acceptedAt: true, cancelledAt: true },
      take: 300,
    });
    for (const r of rides) {
      if (!r.driverId || r.cancelledBy !== r.driverId || !r.acceptedAt || !r.cancelledAt) continue;
      if (r.cancelledAt.getTime() - r.acceptedAt.getTime() < c.waitedMinutes * MIN) continue;
      // Driver had arrived: the passenger did not show up, no apology credit.
      const arrived = await this.prisma.rideEvent.count({ where: { rideId: r.id, event: RideStatus.DRIVER_ARRIVED } });
      if (arrived > 0) continue;
      if (!(await this.once(`auto:comp:${r.id}`, 7 * 24 * 3600))) continue;
      await this.bonus(r.passengerId, c.creditCdf, `Excuses SENGA : course annulée par le chauffeur ${r.id.slice(0, 8)}`, `COMP:${r.id}`);
      await this.tell(r.passengerId, 'Toutes nos excuses', `Votre chauffeur a annulé après votre attente. ${formatCdf(c.creditCdf)} ont été ajoutés à votre portefeuille.`);
    }
  }

  // 11. Low rating: a ticket in Alertes staff (once per rating).
  private async lowRatings() {
    const rows = await this.prisma.rating.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 30 * MIN) }, score: { lte: this.cfg.lowRatingTicket.maxStars } },
      select: { id: true, rideId: true, score: true, comment: true, fromUserId: true, toUserId: true },
      take: 200,
    });
    for (const r of rows) {
      if (!(await this.once(`auto:lowrating:${r.id}`, 7 * 24 * 3600))) continue;
      await postStaffAlert({
        severity: 'WARNING',
        title: `Ticket : note ${r.score}/5 sur une course`,
        body: `Course ${r.rideId.slice(0, 8)} · ${r.comment ? `« ${r.comment.slice(0, 200)} »` : 'sans commentaire'} — à vérifier et rappeler le client.`,
        href: `/courses?search=${r.rideId}`,
      });
    }
  }

  // 4–5. Win-back: passengers and drivers without a ride for N days (once per period).
  private async winBack() {
    const c = this.cfg.winBack;
    const window = async (column: 'passengerId' | 'driverId', days: number) => {
      const from = new Date(Date.now() - (days + 1) * DAY);
      const to = new Date(Date.now() - days * DAY);
      const col = Prisma.raw(`"${column}"`);
      return this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT ${col} AS id FROM rides
        WHERE status = 'COMPLETED' AND ${col} IS NOT NULL AND "testVoidedAt" IS NULL
        GROUP BY ${col}
        HAVING MAX("updatedAt") >= ${from} AND MAX("updatedAt") < ${to}
        LIMIT 1000`;
    };
    for (const { id } of await window('passengerId', c.passengerDays)) {
      if (!(await this.once(`auto:winback:p:${id}`, c.passengerDays * 24 * 3600))) continue;
      let body = 'Vous nous manquez ! Votre prochaine course SENGA est à un clic.';
      if (c.passengerCreditCdf > 0) {
        await this.bonus(id, c.passengerCreditCdf, 'Cadeau de retour SENGA', `WINBACK:${id}:${kinshasaClock().day.slice(0, 7)}`).catch(() => undefined);
        body = `Vous nous manquez ! ${formatCdf(c.passengerCreditCdf)} vous attendent sur votre portefeuille SENGA.`;
      }
      await this.tell(id, 'Revenez sur SENGA', body);
    }
    const recent = await this.prisma.ride.count({ where: { status: RideStatus.COMPLETED, updatedAt: { gte: new Date(Date.now() - 7 * DAY) } } });
    for (const { id } of await window('driverId', c.driverDays)) {
      if (!(await this.once(`auto:winback:d:${id}`, c.driverDays * 24 * 3600))) continue;
      await this.tell(id, 'Des courses vous attendent', `${recent} courses ont été faites sur SENGA cette semaine. Connectez-vous pour en profiter.`);
    }
  }

  // 7. Fraud signals of yesterday: repeated pairs and too-short rides; optional block.
  private async fraud() {
    const c = this.cfg.fraudWatch;
    const from = new Date(Date.now() - DAY);
    const pairs = await this.prisma.ride.groupBy({
      by: ['passengerId', 'driverId'],
      where: { status: RideStatus.COMPLETED, updatedAt: { gte: from }, driverId: { not: null }, testVoidedAt: null },
      _count: { _all: true },
    });
    const suspectPairs = pairs.filter((p) => p._count._all >= c.minPairRides);
    const short = await this.prisma.ride.groupBy({
      by: ['driverId'],
      where: { status: RideStatus.COMPLETED, updatedAt: { gte: from }, distanceKm: { lt: c.shortRideKm }, driverId: { not: null }, testVoidedAt: null },
      _count: { _all: true },
    });
    const suspectShort = short.filter((s) => s._count._all >= 3);
    if (!suspectPairs.length && !suspectShort.length) return;
    const lines = [
      ...suspectPairs.map((p) => `même passager et chauffeur ${p._count._all} fois (chauffeur ${String(p.driverId).slice(0, 8)})`),
      ...suspectShort.map((s) => `${s._count._all} courses de moins de ${c.shortRideKm} km (chauffeur ${String(s.driverId).slice(0, 8)})`),
    ];
    await postStaffAlert({ severity: 'WARNING', title: `Fraude possible : ${lines.length} signal(aux)`, body: lines.slice(0, 15).join(' · '), href: '/chauffeurs' });
    if (!c.autoBlock) return;
    const drivers = new Set([...suspectPairs.map((p) => p.driverId), ...suspectShort.map((s) => s.driverId)].filter(Boolean) as string[]);
    for (const id of drivers) {
      await fetch(serviceUrl('driver', `/internal/drivers/${id}/quality-block`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ reason: 'Fraude possible (Automatisations) — à vérifier' }),
      }).catch(() => undefined);
    }
  }

  // 15. Maintenance reminder every N km driven with SENGA.
  private async maintenance() {
    const every = this.cfg.maintenanceReminder.everyKm;
    const totals = await this.prisma.ride.groupBy({
      by: ['driverId'],
      where: { status: RideStatus.COMPLETED, driverId: { not: null }, testVoidedAt: null },
      _sum: { distanceKm: true },
    });
    for (const t of totals) {
      if (!t.driverId) continue;
      const km = Math.round(Number(t._sum.distanceKm ?? 0));
      const key = `auto:maint:km:${t.driverId}`;
      const prev = Number(await this.redis.client.get(key).catch(() => null));
      await this.redis.client.set(key, String(km)).catch(() => undefined);
      if (!Number.isFinite(prev) || prev <= 0) continue; // first run: just remember
      const milestone = maintenanceMilestone(prev, km, every);
      if (milestone > 0) {
        await this.tell(t.driverId, 'Entretien du véhicule', `Vous avez roulé ${milestone} km avec SENGA : pensez à la vidange, aux freins et aux pneus.`);
      }
    }
  }
}
