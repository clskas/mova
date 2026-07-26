import { Injectable, Logger } from '@nestjs/common';
import { httpGetJson } from '../common/http-fetch.util';

export type NominatimPlace = {
  label: string;
  address: string;
  lat: number;
  lng: number;
  commune: string | null;
  city: string | null;
  osmType?: string;
  osmId?: number;
};

type NominatimSearchHit = {
  display_name?: string;
  lat?: string;
  lon?: string;
  osm_type?: string;
  osm_id?: number;
  address?: Record<string, string | undefined>;
};

@Injectable()
export class NominatimService {
  private readonly logger = new Logger(NominatimService.name);
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly email?: string;
  private lastRequestAt = 0;
  private readonly minIntervalMs: number;

  constructor() {
    this.baseUrl = (process.env.NOMINATIM_BASE_URL ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
    this.enabled = process.env.NOMINATIM_ENABLED !== 'false';
    this.timeoutMs = parseInt(process.env.NOMINATIM_TIMEOUT_MS ?? '5000', 10);
    this.userAgent =
      process.env.NOMINATIM_USER_AGENT ?? 'SENGA-RDC/1.0 (ride-service; https://mova.cd)';
    this.email = process.env.NOMINATIM_EMAIL?.trim() || undefined;
    this.minIntervalMs = parseInt(process.env.NOMINATIM_MIN_INTERVAL_MS ?? '1000', 10);
  }

  /** Géocodage : texte → coordonnées (autocomplétion adresses OSM). */
  async search(
    query: string,
    opts?: {
      city?: string;
      centerLat?: number;
      centerLng?: number;
      viewbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
      limit?: number;
    },
  ): Promise<NominatimPlace[]> {
    if (!this.enabled) return [];
    const q = query.trim();
    if (q.length < 2) return [];

    const city = opts?.city?.trim();
    const searchText = city ? `${q}, ${city}, République Démocratique du Congo` : `${q}, RDC`;
    const params = new URLSearchParams({
      q: searchText,
      format: 'json',
      addressdetails: '1',
      limit: String(Math.min(opts?.limit ?? 5, 10)),
      countrycodes: 'cd',
    });

    if (opts?.centerLat != null && opts?.centerLng != null) {
      params.set('lat', String(opts.centerLat));
      params.set('lon', String(opts.centerLng));
    }
    if (opts?.viewbox) {
      const { minLng, minLat, maxLng, maxLat } = opts.viewbox;
      params.set('viewbox', `${minLng},${maxLat},${maxLng},${minLat}`);
      params.set('bounded', '1');
    }

    const hits = await this.fetchJson<NominatimSearchHit[]>(`/search?${params.toString()}`);
    if (!hits?.length) return [];
    return hits
      .map((hit) => this.mapHit(hit, city))
      .filter((p): p is NominatimPlace => p != null);
  }

  /** Reverse geocoding : coordonnées → libellé adresse OSM. */
  async reverse(lat: number, lng: number): Promise<NominatimPlace | null> {
    if (!this.enabled) return null;
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'json',
      addressdetails: '1',
      zoom: '18',
    });
    const hit = await this.fetchJson<NominatimSearchHit>(`/reverse?${params.toString()}`);
    if (!hit) return null;
    return this.mapHit(hit);
  }

  private mapHit(hit: NominatimSearchHit, fallbackCity?: string): NominatimPlace | null {
    const lat = hit.lat != null ? parseFloat(hit.lat) : NaN;
    const lng = hit.lon != null ? parseFloat(hit.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const addr = hit.address ?? {};
    const commune =
      addr.suburb ?? addr.neighbourhood ?? addr.quarter ?? addr.city_district ?? addr.district ?? null;
    const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? fallbackCity ?? null;
    const street = addr.road ?? addr.pedestrian ?? addr.footway ?? addr.path;
    const label = hit.display_name ?? [street, commune, city].filter(Boolean).join(', ') ?? `${lat}, ${lng}`;

    return {
      label,
      address: label,
      lat,
      lng,
      commune,
      city,
      osmType: hit.osm_type,
      osmId: hit.osm_id,
    };
  }

  private async fetchJson<T>(path: string): Promise<T | null> {
    await this.throttle();
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': this.userAgent,
      };
      if (this.email) headers['From'] = this.email;

      // Client node:https IPv4 forcé (undici instable dans le réseau Docker).
      const data = await httpGetJson<T>(`${this.baseUrl}${path}`, {
        headers,
        timeoutMs: this.timeoutMs,
      });
      if (data == null) {
        this.logger.warn(`Nominatim empty/non-2xx for ${path}`);
        return null;
      }
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Nominatim unavailable: ${msg}`);
      return null;
    }
  }

  /** Politique Nominatim : max 1 requête/seconde sur le serveur public. */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = this.minIntervalMs - (now - this.lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }
}
