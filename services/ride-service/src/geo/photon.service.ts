import { Injectable, Logger } from '@nestjs/common';

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
    const searchText = city ? `${q}, ${city}, RDC` : `${q}, RDC`;
    const params = new URLSearchParams({
      q: searchText,
      limit: String(Math.min(opts?.limit ?? 5, 10)),
      lang: 'fr',
    });

    if (opts?.centerLat != null && opts?.centerLng != null) {
      params.set('lat', String(opts.centerLat));
      params.set('lon', String(opts.centerLng));
    }
    if (opts?.viewbox) {
      const { minLng, minLat, maxLng, maxLat } = opts.viewbox;
      params.set('bbox', `${minLng},${minLat},${maxLng},${maxLat}`);
    }

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        this.logger.warn(`Photon HTTP ${res.status} for ${path}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Photon unavailable: ${msg}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
