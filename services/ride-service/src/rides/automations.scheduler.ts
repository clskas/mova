import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { formatCdf, kinshasaClock, postStaffAlert, RedisService, resolveCityFromCoords } from '@mova/shared';
import { PlatformConfigService } from '../platform/platform-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { RidesService } from './rides.service';
import { DriverIncentivesService } from './driver-incentives.service';
import { RideSafetyService } from './ride-safety.service';

const TICK_MS = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Anomaly verdict for one city and one hour (pure, tested). */
export function anomalyFor(
  stats: { requests: number; cancelled: number; unserved: number },
  cfg: { minRequestsPerHour: number; cancelRatePct: number; unservedPerHour: number },
): string[] {
  const out: string[] = [];
  if (stats.requests >= cfg.minRequestsPerHour && (stats.cancelled * 100) / stats.requests >= cfg.cancelRatePct) {
    out.push(`${Math.round((stats.cancelled * 100) / stats.requests)} % d'annulations (${stats.cancelled}/${stats.requests})`);
  }
  if (stats.unserved >= cfg.unservedPerHour) out.push(`${stats.unserved} passager(s) sans chauffeur`);
  return out;
}

/**
 * Admin automations run by ride-service: the morning report of the day before and the
 * hourly anomaly checks. Each one has its switch in Admin → Automatisations.
 */
@Injectable()
export class AutomationsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationsScheduler.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private rides: RidesService,
    private platformConfig: PlatformConfigService,
    private incentives: DriverIncentivesService,
    private safety: RideSafetyService,
  ) {}

  private safetyTimer?: ReturnType<typeof setInterval>;

  onModuleInit() {
    if (process.env.AUTOMATIONS_DISABLED === 'true') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    // Rides in progress are checked more often (long stop / detour).
    this.safetyTimer = setInterval(() => void this.safety.checkRoutes().catch((e: unknown) => this.logger.warn(`routes: ${String(e)}`)), 3 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.safetyTimer) clearInterval(this.safetyTimer);
  }

  /** Once per key across instances. */
  private async once(key: string, ttlSec: number): Promise<boolean> {
    try {
      return (await this.redis.client.set(key, '1', 'EX', ttlSec, 'NX')) === 'OK';
    } catch {
      return false;
    }
  }

  async tick() {
    await this.platformConfig.refresh().catch(() => undefined);
    const a = this.platformConfig.get().automations;
    const clock = kinshasaClock();
    if (a.dailyReport.enabled && clock.hour === a.dailyReport.hourKinshasa) {
      await this.dailyReport(clock.day).catch((e: unknown) => this.logger.warn(`daily report: ${String(e)}`));
    }
    if (a.driverBonus.enabled && clock.hour === 1 && (await this.once(`auto:bonus:${clock.day}`, 36 * 3600))) {
      const y = new Date(`${clock.day}T12:00:00+01:00`);
      y.setDate(y.getDate() - 1);
      await this.incentives.payDailyBonuses(kinshasaClock(y).day).catch((e: unknown) => this.logger.warn(`bonus: ${String(e)}`));
    }
    if (a.referral.enabled && (await this.once(`auto:referral:${Math.floor(Date.now() / 3_600_000)}`, 2 * 3600))) {
      await this.incentives.payReferrals().catch((e: unknown) => this.logger.warn(`referral: ${String(e)}`));
    }
    if (a.sentryDigest.enabled && clock.hour === a.sentryDigest.hourKinshasa && (await this.once(`auto:sentry:${clock.day}`, 36 * 3600))) {
      await this.sentryDigest().catch((e: unknown) => this.logger.warn(`sentry digest: ${String(e)}`));
    }
    if (a.ratingQuality.enabled && clock.hour === 6 && (await this.once(`auto:quality-run:${clock.day}`, 36 * 3600))) {
      await this.safety.checkQuality().catch((e: unknown) => this.logger.warn(`quality: ${String(e)}`));
    }
    if (a.anomalyAlerts.enabled) {
      await this.anomalies(a.anomalyAlerts).catch((e: unknown) => this.logger.warn(`anomalies: ${String(e)}`));
    }
  }

  /**
   * Errors seen by the apps in the last 24 h (Sentry, read-only token SENGA_SENTRY / SENTRY_READ_TOKEN
   * set on the server by the owner). Nothing is sent to Sentry.
   */
  private async sentryDigest() {
    const token = process.env.SENTRY_READ_TOKEN?.trim();
    const org = process.env.SENTRY_ORG?.trim() || 'afrisoft-g0';
    if (!token) {
      await postStaffAlert({
        severity: 'INFO',
        title: 'Résumé Sentry non disponible',
        body: 'Ajoutez la variable SENTRY_READ_TOKEN (jeton Sentry en lecture seule) au service ride sur Render pour recevoir le résumé quotidien des erreurs.',
        href: '/automatisations',
      });
      return;
    }
    const res = await fetch(
      `https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/issues/?query=is:unresolved%20lastSeen:-24h&statsPeriod=24h&sort=freq&limit=10`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) throw new Error(`sentry HTTP ${res.status}`);
    const issues = (await res.json()) as Array<{ shortId?: string; title?: string; count?: string; project?: { slug?: string } }>;
    await postStaffAlert({
      severity: issues.length ? 'WARNING' : 'INFO',
      title: issues.length ? `${issues.length} erreur(s) d’application en 24 h` : 'Aucune nouvelle erreur d’application',
      body: issues.length
        ? issues.map((i) => `${i.shortId ?? '?'} (${i.count ?? '?'}×) ${String(i.title ?? '').slice(0, 90)}`).join(' · ')
        : 'Sentry ne signale aucune erreur non résolue vue ces dernières 24 h.',
      href: '/automatisations',
    });
  }

  private async dailyReport(today: string) {
    if (!(await this.once(`auto:daily-report:${today}`, 36 * 3600))) return;
    const y = new Date(`${today}T12:00:00+01:00`);
    y.setDate(y.getDate() - 1);
    const yesterday = kinshasaClock(y).day;
    const r = (await this.rides.getReportAnalytics(1, null, { from: yesterday, to: yesterday })) as {
      kpis: {
        totalRides: number;
        completedRides: number;
        cancelledRides: number;
        cancelRate: number;
        totalRevenueCdf: number;
        deliveryRevenueCdf: number;
        totalDeliveries: number;
        totalPlatformCommissionCdf: number;
      };
    };
    const k = r.kpis;
    const [d, m, yy] = [yesterday.slice(8, 10), yesterday.slice(5, 7), yesterday.slice(0, 4)];
    await postStaffAlert({
      severity: 'INFO',
      title: `Rapport du ${d}/${m}/${yy}`,
      body:
        `Courses : ${k.completedRides} terminées sur ${k.totalRides} (${Math.round(k.cancelRate * 100)} % annulées). ` +
        `Livraisons : ${k.totalDeliveries}. Revenus : ${formatCdf(k.totalRevenueCdf + k.deliveryRevenueCdf)}. ` +
        `Commissions SENGA : ${formatCdf(k.totalPlatformCommissionCdf)}.`,
      href: '/rapports',
    });
  }

  private async anomalies(cfg: { minRequestsPerHour: number; cancelRatePct: number; unservedPerHour: number }) {
    const now = Date.now();
    const slot = Math.floor(now / HOUR);
    const rides = await this.prisma.ride.findMany({
      where: { createdAt: { gte: new Date(now - HOUR) }, testVoidedAt: null },
      select: { status: true, driverId: true, createdAt: true, pickupLat: true, pickupLng: true },
      take: 5000,
    });
    const byCity = new Map<string, { requests: number; cancelled: number; unserved: number }>();
    for (const r of rides) {
      const city = resolveCityFromCoords(r.pickupLat, r.pickupLng);
      const s = byCity.get(city) ?? { requests: 0, cancelled: 0, unserved: 0 };
      s.requests++;
      if (r.status === RideStatus.CANCELLED) s.cancelled++;
      const waiting = r.status === RideStatus.REQUESTED || r.status === RideStatus.SEARCHING;
      if ((r.status === RideStatus.CANCELLED && !r.driverId) || (waiting && now - r.createdAt.getTime() > 10 * 60 * 1000)) {
        s.unserved++;
      }
      byCity.set(city, s);
    }
    for (const [city, stats] of byCity) {
      const problems = anomalyFor(stats, cfg);
      if (!problems.length) continue;
      if (!(await this.once(`auto:anomaly:${city}:${slot}`, 2 * 3600))) continue;
      await postStaffAlert({
        severity: 'WARNING',
        title: `Anomalie à ${city}`,
        body: `Dernière heure : ${problems.join(' ; ')}. Vérifiez les chauffeurs en ligne et les tarifs.`,
        city,
        href: '/courses',
      });
    }
  }
}
