import { Injectable, Logger } from '@nestjs/common';
import { RDC_TERRITORY_BOUNDS } from '@mova/shared';
import { httpGetJson } from '../common/http-fetch.util';

export type MapboxPlace = {
  label: string;
  address: string;
  lat: number;
  lng: number;
  commune: string | null;
  city: string | null;
};

type MapboxFeature = {
  place_name?: string;
  text?: string;
  center?: [number, number];
  context?: { id?: string; text?: string }[];
  place_type?: string[];
};

type MapboxResponse = {
  features?: MapboxFeature[];
};

/**
 * Géocodage Mapbox Places — priorité quand MAPBOX_ACCESS_TOKEN est défini.
 * Couverture RDC via country=cd + bbox nationale.
 */
@Injectable()
export class MapboxService {
  private readonly logger = new Logger(MapboxService.name);
  private readonly token: string;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly baseUrl =
    'https://api.mapbox.com/geocoding/v5/mapbox.places';

  constructor() {
    this.token = (process.env.MAPBOX_ACCESS_TOKEN ?? '').trim();
    this.enabled = this.token.length > 0 && process.env.MAPBOX_GEOCODE_ENABLED !== 'false';
    this.timeoutMs = parseInt(process.env.MAPBOX_TIMEOUT_MS ?? '5000', 10);
  }

  isConfigured(): boolean {
    return this.enabled;
  }

  async search(
    query: string,
    opts?: {
      centerLat?: number;
      centerLng?: number;
      limit?: number;
    },
  ): Promise<MapboxPlace[]> {
    if (!this.enabled) return [];
    const q = query.trim();
    if (q.length < 2) return [];

    const b = RDC_TERRITORY_BOUNDS;
    const params = new URLSearchParams({
      access_token: this.token,
      country: 'cd',
      language: 'fr',
      limit: String(Math.min(opts?.limit ?? 5, 10)),
      // minLon,minLat,maxLon,maxLat — territoire RDC entier
      bbox: `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`,
      autocomplete: 'true',
    });

    if (opts?.centerLat != null && opts?.centerLng != null) {
      params.set('proximity', `${opts.centerLng},${opts.centerLat}`);
    }

    const encoded = encodeURIComponent(q);
    const data = await this.fetchJson<MapboxResponse>(
      `${this.baseUrl}/${encoded}.json?${params.toString()}`,
    );
    if (!data?.features?.length) return [];

    return data.features
      .map((f) => this.mapFeature(f))
      .filter((p): p is MapboxPlace => p != null);
  }

  private mapFeature(feature: MapboxFeature): MapboxPlace | null {
    const center = feature.center;
    if (!center || center.length < 2) return null;
    const [lng, lat] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const ctx = feature.context ?? [];
    const place = ctx.find((c) => c.id?.startsWith('place.'))?.text;
    const locality = ctx.find((c) => c.id?.startsWith('locality.'))?.text;
    const neighborhood = ctx.find((c) => c.id?.startsWith('neighborhood.'))?.text;
    const district = ctx.find((c) => c.id?.startsWith('district.'))?.text;
    const region = ctx.find((c) => c.id?.startsWith('region.'))?.text;

    const commune = neighborhood ?? locality ?? district ?? null;
    const city = place ?? locality ?? region ?? null;
    const label = feature.place_name ?? feature.text ?? `${lat}, ${lng}`;

    return {
      label,
      address: label,
      lat,
      lng,
      commune,
      city,
    };
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const data = await httpGetJson<T>(url, {
        headers: { Accept: 'application/json' },
        timeoutMs: this.timeoutMs,
      });
      if (data == null) {
        this.logger.warn('Mapbox geocode empty/non-2xx');
        return null;
      }
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Mapbox unavailable: ${msg}`);
      return null;
    }
  }
}
