import { Injectable, Logger } from '@nestjs/common';
import { RDC_TERRITORY_BOUNDS } from '@mova/shared';
import { httpGetJson } from '../common/http-fetch.util';

export type PhotonPlace = {
  label: string;
  address: string;
  lat: number;
  lng: number;
  commune: string | null;
  city: string | null;
  osmType?: string;
  osmId?: number;
};

type PhotonFeature = {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    osm_type?: string;
    osm_id?: number;
    type?: string;
  };
  geometry?: { coordinates?: [number, number] };
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

@Injectable()
export class PhotonService {
  private readonly logger = new Logger(PhotonService.name);
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = (process.env.PHOTON_BASE_URL ?? 'https://photon.komoot.io').replace(/\/$/, '');
    this.enabled = process.env.PHOTON_ENABLED !== 'false';
    this.timeoutMs = parseInt(process.env.PHOTON_TIMEOUT_MS ?? '8000', 10);
  }

  async search(
    query: string,
    opts?: {
      city?: string;
      centerLat?: number;
      centerLng?: number;
      viewbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
      limit?: number;
    },
  ): Promise<PhotonPlace[]> {
    if (!this.enabled) return [];
    const q = query.trim();
    if (q.length < 2) return [];

    const city = opts?.city?.trim();
    // Requête nationale — bias proximité via lat/lon, pas via suffixe ville GPS.
    const searchText = `${q}, RDC`;
    const params = new URLSearchParams({
      q: searchText,
      limit: String(Math.min(opts?.limit ?? 5, 10)),
      lang: 'fr',
    });

    if (opts?.centerLat != null && opts?.centerLng != null) {
      params.set('lat', String(opts.centerLat));
      params.set('lon', String(opts.centerLng));
    }
    const viewbox = opts?.viewbox ?? {
      minLng: RDC_TERRITORY_BOUNDS.minLng,
      minLat: RDC_TERRITORY_BOUNDS.minLat,
      maxLng: RDC_TERRITORY_BOUNDS.maxLng,
      maxLat: RDC_TERRITORY_BOUNDS.maxLat,
    };
    const { minLng, minLat, maxLng, maxLat } = viewbox;
    params.set('bbox', `${minLng},${minLat},${maxLng},${maxLat}`);

    const data = await this.fetchJson<PhotonResponse>(`/api/?${params.toString()}`);
    if (!data?.features?.length) return [];

    return data.features
      .map((feature) => this.mapFeature(feature, city))
      .filter((p): p is PhotonPlace => p != null);
  }

  async reverse(lat: number, lng: number): Promise<PhotonPlace | null> {
    if (!this.enabled) return null;
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      lang: 'fr',
    });
    const data = await this.fetchJson<PhotonResponse>(`/reverse?${params.toString()}`);
    const feature = data?.features?.[0];
    if (!feature) return null;
    return this.mapFeature(feature);
  }

  private mapFeature(feature: PhotonFeature, fallbackCity?: string): PhotonPlace | null {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const props = feature.properties ?? {};
    if (props.countrycode && props.countrycode.toUpperCase() !== 'CD') return null;

    const commune = props.district ?? props.locality ?? props.state ?? null;
    const city = props.city ?? props.state ?? fallbackCity ?? null;
    const streetParts = [props.housenumber, props.street ?? props.name].filter(Boolean);
    const street = streetParts.join(' ').trim();
    const labelParts = [props.name ?? street, commune, city, props.country ?? 'RDC'].filter(Boolean);
    const label = labelParts.join(', ') || `${lat}, ${lng}`;

    return {
      label,
      address: label,
      lat,
      lng,
      commune,
      city,
      osmType: props.osm_type,
      osmId: props.osm_id,
    };
  }

  private async fetchJson<T>(path: string): Promise<T | null> {
    try {
      // Client node:https IPv4 forcé : le fetch global (undici) est instable
      // dans le réseau Docker (happy-eyeballs IPv6 → timeouts intermittents).
      const data = await httpGetJson<T>(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        timeoutMs: this.timeoutMs,
      });
      if (data == null) {
        this.logger.warn(`Photon empty/non-2xx for ${path}`);
        return null;
      }
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Photon unavailable: ${msg}`);
      return null;
    }
  }
}
