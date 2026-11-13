import { Injectable } from '@nestjs/common';
import { RideStatus, VehicleType } from '@prisma/client';
import { PlatformConfigService } from '../platform/platform-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';

/** ~3 km around the pickup (latitude degrees), and the window of open requests counted. */
const AREA_DEG = 0.03;
const WINDOW_MS = 10 * 60 * 1000;
/** Same level for 2 minutes in an area: the price shown is the price ordered. */
const CACHE_MS = 2 * 60 * 1000;

export type DemandLevel = 0 | 1 | 2;

/** Level from open requests and free drivers nearby (pure, tested). */
export function demandLevel(requests: number, freeDrivers: number, minRequests: number): DemandLevel {
  if (requests < minRequests) return 0;
  const ratio = requests / Math.max(1, freeDrivers);
  if (ratio >= 2) return 2;
  if (ratio >= 1) return 1;
  return 0;
}

/**
 * Demand surge for immediate rides: many passengers waiting and few free drivers around the
 * pickup → ×1.2 (medium) or ×1.4 (high), set by the admin. Attracts drivers where they are needed.
 */
@Injectable()
export class DemandSurgeService {
  private cache = new Map<string, { at: number; level: DemandLevel }>();

  constructor(
    private prisma: PrismaService,
    private matching: MatchingService,
    private platformConfig: PlatformConfigService,
  ) {}

  async multiplier(lat: number, lng: number, vehicleType: VehicleType): Promise<{ level: DemandLevel; multiplier: number }> {
    const p = this.platformConfig.get().pricing;
    if (!p.demandSurgeEnabled) return { level: 0, multiplier: 1 };
    const level = await this.level(lat, lng, vehicleType, p.demandSurgeMinRequests).catch(() => 0 as DemandLevel);
    const multiplier = level === 2 ? p.demandSurgeHighMultiplier : level === 1 ? p.demandSurgeMediumMultiplier : 1;
    return { level, multiplier: Math.max(1, multiplier) };
  }

  private async level(lat: number, lng: number, vehicleType: VehicleType, minRequests: number): Promise<DemandLevel> {
    const key = `${vehicleType}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && now - hit.at < CACHE_MS) return hit.level;
    const requests = await this.prisma.ride.count({
      where: {
        status: { in: [RideStatus.REQUESTED, RideStatus.SEARCHING] },
        vehicleType,
        isShared: false,
        createdAt: { gte: new Date(now - WINDOW_MS) },
        pickupLat: { gte: lat - AREA_DEG, lte: lat + AREA_DEG },
        pickupLng: { gte: lng - AREA_DEG, lte: lng + AREA_DEG },
      },
    });
    let level: DemandLevel = 0;
    if (requests >= minRequests) {
      const drivers = await this.matching.findDrivers(lat, lng, vehicleType, 1).catch(() => []);
      level = demandLevel(requests, drivers.length, minRequests);
    }
    this.cache.set(key, { at: now, level });
    if (this.cache.size > 2000) this.cache.clear();
    return level;
  }
}
