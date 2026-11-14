import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { formatCdf, kinshasaClock, postStaffAlert, RedisService, resolveCityFromCoords } from '@mova/shared';
import { PlatformConfigService } from '../platform/platform-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { RidesService } from './rides.service';

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
  ) {}

  onModuleInit() {
    if (process.env.AUTOMATIONS_DISABLED === 'true') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
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
    if (a.anomalyAlerts.enabled) {
      await this.anomalies(a.anomalyAlerts).catch((e: unknown) => this.logger.warn(`anomalies: ${String(e)}`));
    }
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
