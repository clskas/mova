import { Injectable, Logger } from '@nestjs/common';
import { RideStatus, TrackingReferenceType } from '@prisma/client';
import {
  INTERNAL_API_KEY,
  MOVA_EVENTS,
  postStaffAlert,
  RedisService,
  serviceUrl,
  type PaymentReminderPayload,
} from '@mova/shared';
import { PlatformConfigService } from '../platform/platform-config.service';
import { PrismaService } from '../prisma/prisma.service';

const R = 6371;
function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** What looks wrong in a ride in progress (pure, tested). */
export function routeVerdict(input: {
  points: { lat: number; lng: number; at: Date }[];
  startedAt: Date;
  now: Date;
  pickup: { lat: number; lng: number };
  dropoff: { lat: number; lng: number };
  stopMinutes: number;
  detourKm: number;
}): Array<'STOP' | 'DETOUR'> {
  const out: Array<'STOP' | 'DETOUR'> = [];
  const pts = [...input.points].sort((a, b) => a.at.getTime() - b.at.getTime());
  const last = pts[pts.length - 1];
  if (!last) return out;
  const windowStart = input.now.getTime() - input.stopMinutes * 60_000;
  const recent = pts.filter((p) => p.at.getTime() >= windowStart);
  // Stopped: started long enough ago, several recent points, all within 150 m, far from the drop-off.
  if (
    input.now.getTime() - input.startedAt.getTime() > input.stopMinutes * 60_000 &&
    recent.length >= 3 &&
    recent.every((p) => km(p.lat, p.lng, last.lat, last.lng) < 0.15) &&
    km(last.lat, last.lng, input.dropoff.lat, input.dropoff.lng) > 0.3
  ) {
    out.push('STOP');
  }
  const direct = km(input.pickup.lat, input.pickup.lng, input.dropoff.lat, input.dropoff.lng);
  const fromPickup = km(input.pickup.lat, input.pickup.lng, last.lat, last.lng);
  const toDrop = km(last.lat, last.lng, input.dropoff.lat, input.dropoff.lng);
  if (fromPickup + toDrop > direct + input.detourKm) out.push('DETOUR');
  return out;
}

/** Average of the last N marks (pure, tested); null when there are fewer. */
export function lowRating(scores: number[], minRatings: number, minAvg: number): number | null {
  if (scores.length < minRatings) return null;
  const last = scores.slice(0, minRatings);
  const avg = last.reduce((s, v) => s + v, 0) / last.length;
  return avg < minAvg ? Math.round(avg * 100) / 100 : null;
}

/** Ride safety (long stop, detour) and driver quality, Admin → Automatisations. */
@Injectable()
export class RideSafetyService {
  private readonly logger = new Logger(RideSafetyService.name);

  constructor(private prisma: PrismaService, private redis: RedisService, private platformConfig: PlatformConfigService) {}

  private async once(key: string, ttlSec: number) {
    return (await this.redis.client.set(key, '1', 'EX', ttlSec, 'NX').catch(() => null)) === 'OK';
  }

  async checkRoutes() {
    const cfg = this.platformConfig.get().automations.routeAnomaly;
    if (!cfg.enabled) return;
    const rides = await this.prisma.ride.findMany({
      where: { status: RideStatus.IN_PROGRESS, isShared: false, testVoidedAt: null, startedAt: { not: null } },
      select: { id: true, passengerId: true, driverId: true, startedAt: true, pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true },
      take: 300,
    });
    const now = new Date();
    for (const r of rides) {
      const points = await this.prisma.trackingPoint.findMany({
        where: { referenceType: TrackingReferenceType.RIDE, referenceId: r.id, recordedAt: { gte: new Date(now.getTime() - (cfg.stopMinutes + 5) * 60_000) } },
        orderBy: { recordedAt: 'desc' },
        select: { lat: true, lng: true, recordedAt: true },
        take: 60,
      });
      const verdicts = routeVerdict({
        points: points.map((p) => ({ lat: p.lat, lng: p.lng, at: p.recordedAt })),
        startedAt: r.startedAt!,
        now,
        pickup: { lat: r.pickupLat, lng: r.pickupLng },
        dropoff: { lat: r.dropoffLat, lng: r.dropoffLng },
        stopMinutes: cfg.stopMinutes,
        detourKm: cfg.detourKm,
      });
      for (const v of verdicts) {
        if (!(await this.once(`auto:route:${r.id}:${v}`, 6 * 3600))) continue;
        const what = v === 'STOP' ? `arrêt de plus de ${cfg.stopMinutes} minutes` : `détour de plus de ${cfg.detourKm} km`;
        await this.redis.publish(MOVA_EVENTS.PAYMENT_REMINDER, {
          userId: r.passengerId,
          title: 'Tout va bien ?',
          body: `Nous remarquons un ${what} pendant votre course. Si vous êtes en danger, appuyez sur SOS dans l’application.`,
          kind: 'SAFETY_CHECK',
          rideId: r.id,
          referenceType: 'RIDE',
          referenceId: r.id,
          sms: false,
        } satisfies PaymentReminderPayload).catch(() => undefined);
        await postStaffAlert({
          severity: 'WARNING',
          title: v === 'STOP' ? 'Course arrêtée longtemps' : 'Course avec un grand détour',
          body: `Course ${r.id.slice(0, 8)} : ${what}. Le passager a été prévenu (bouton SOS).`,
          href: '/courses',
        });
      }
    }
  }

  async checkQuality() {
    const cfg = this.platformConfig.get().automations.ratingQuality;
    if (!cfg.enabled) return;
    const recent = await this.prisma.rating.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 60 * 86_400_000) }, ride: { driverId: { not: null } } },
      select: { toUserId: true, score: true, createdAt: true, ride: { select: { driverId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20000,
    });
    const byDriver = new Map<string, number[]>();
    for (const r of recent) {
      if (r.toUserId !== r.ride.driverId) continue;
      const list = byDriver.get(r.toUserId) ?? [];
      list.push(r.score);
      byDriver.set(r.toUserId, list);
    }
    for (const [driverId, scores] of byDriver) {
      const avg = lowRating(scores, cfg.minRatings, cfg.minAvg);
      if (avg == null) continue;
      if (!(await this.once(`auto:quality:${driverId}`, 7 * 86_400))) continue;
      const reason = `Moyenne ${avg}/5 sur les ${cfg.minRatings} dernières notes (seuil ${cfg.minAvg}).`;
      if (cfg.autoBlock) {
        await fetch(serviceUrl('driver', `/internal/drivers/${driverId}/quality-block`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
          body: JSON.stringify({ reason }),
        }).catch(() => undefined);
      }
      await postStaffAlert({
        severity: cfg.autoBlock ? 'CRITICAL' : 'WARNING',
        title: cfg.autoBlock ? 'Chauffeur suspendu pour qualité' : 'Chauffeur mal noté',
        body: `Chauffeur ${driverId.slice(0, 8)} : ${reason}${cfg.autoBlock ? ' Il ne peut plus passer en ligne (déblocage : Automatisations).' : ''}`,
        href: '/automatisations',
      });
    }
  }
}
