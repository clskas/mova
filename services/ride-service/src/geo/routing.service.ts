import { Injectable, Logger } from '@nestjs/common';
import { estimateRoadDistanceKm } from '@mova/shared';

export type RoadDistanceSource = 'stored' | 'osrm' | 'estimated';

export type RoadDistanceResult = {
  distanceKm: number;
  source: RoadDistanceSource;
  durationMin?: number;
};

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = (process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org').replace(/\/$/, '');
    this.enabled = process.env.OSRM_ENABLED !== 'false';
    this.timeoutMs = parseInt(process.env.OSRM_TIMEOUT_MS ?? '5000', 10);
  }

  haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Distance routière (km) — OSRM si disponible, sinon Haversine × facteur détour. */
  async roadDistanceKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
    storedKm?: number | null,
  ): Promise<number> {
    const result = await this.resolveRoadDistance(lat1, lng1, lat2, lng2, storedKm);
    return result.distanceKm;
  }

  async resolveRoadDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
    storedKm?: number | null,
  ): Promise<RoadDistanceResult> {
    if (storedKm != null && storedKm > 0) {
      return { distanceKm: Math.round(storedKm * 100) / 100, source: 'stored' };
    }

    if (this.enabled) {
      const osrm = await this.fetchOsrmRoute(lat1, lng1, lat2, lng2);
      if (osrm) return osrm;
    }

    const straight = this.haversineKm(lat1, lng1, lat2, lng2);
    return {
      distanceKm: estimateRoadDistanceKm(straight),
      source: 'estimated',
    };
  }

  private async fetchOsrmRoute(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): Promise<RoadDistanceResult | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const coords = `${lng1},${lat1};${lng2},${lat2}`;
      const url = `${this.baseUrl}/route/v1/driving/${coords}?overview=false&alternatives=false&steps=false`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        this.logger.warn(`OSRM HTTP ${res.status} for ${coords}`);
        return null;
      }
      const data = (await res.json()) as {
        code?: string;
        routes?: { distance?: number; duration?: number }[];
      };
      if (data.code !== 'Ok' || !data.routes?.length) {
        this.logger.warn(`OSRM no route (${data.code ?? 'unknown'})`);
        return null;
      }
      const route = data.routes[0];
      const meters = route.distance;
      if (meters == null || !Number.isFinite(meters) || meters <= 0) return null;
      const distanceKm = Math.round((meters / 1000) * 100) / 100;
      const durationMin =
        route.duration != null && Number.isFinite(route.duration)
          ? Math.max(1, Math.ceil(route.duration / 60))
          : undefined;
      return { distanceKm, source: 'osrm', durationMin };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`OSRM unavailable: ${msg}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
