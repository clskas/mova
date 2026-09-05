import { Injectable, Logger } from '@nestjs/common';
import { RDC_TERRITORY_BOUNDS } from '@mova/shared';
import { httpGetJson } from '../common/http-fetch.util';
import { resolveDrcProximity } from './drc-proximity';
import { inferPoiCategoryFromMapbox, poiCategorySpec, type PoiCategory } from './poi-category.map';

export type MapboxPlace = {
  label: string;
  address: string;
  lat: number;
  lng: number;
  commune: string | null;
  city: string | null;
  featureType?: string;
  category?: PoiCategory;
};

type MapboxV5Feature = {
  place_name?: string;
  text?: string;
  center?: [number, number];
  context?: { id?: string; text?: string }[];
  place_type?: string[];
};

type MapboxV5Response = {
  features?: MapboxV5Feature[];
};

type SearchBoxContextLayer = {
  id?: string;
  name?: string;
  country_code?: string;
};

type SearchBoxFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    address?: string;
    feature_type?: string;
    poi_category?: string[];
    poi_category_ids?: string[];
    coordinates?: { latitude?: number; longitude?: number };
    context?: {
      country?: SearchBoxContextLayer;
      region?: SearchBoxContextLayer;
      place?: SearchBoxContextLayer;
      locality?: SearchBoxContextLayer;
      neighborhood?: SearchBoxContextLayer;
      district?: SearchBoxContextLayer;
    };
  };
};

type SearchBoxResponse = {
  features?: SearchBoxFeature[];
};

/** Search Box — POI / brand coverage (Geocoding v5 no longer returns POIs). */
const SEARCHBOX_POI_TYPES = 'poi';
const SEARCHBOX_PLACE_TYPES = 'address,street,neighborhood,locality,place,district';
/** Geocoding v5 fallback — addresses / quartiers only (POI removed by Mapbox). */
const GEOCODE_V5_TYPES = 'address,neighborhood,locality,place,district';

/**
 * Géocodage Mapbox — Search Box API (POI + adresses) avec repli Geocoding v5.
 * Bias RDC : country=cd, bbox nationale, proximity (GPS / ville / centroïde RDC).
 */
@Injectable()
export class MapboxService {
  private readonly logger = new Logger(MapboxService.name);
  private readonly token: string;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly searchBoxUrl = 'https://api.mapbox.com/search/searchbox/v1/forward';
  private readonly searchBoxCategoryUrl = 'https://api.mapbox.com/search/searchbox/v1/category';
  private readonly geocodeV5Url = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

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
      city?: string;
      limit?: number;
      poiCategory?: PoiCategory;
    },
  ): Promise<MapboxPlace[]> {
    if (!this.enabled) return [];
    const q = query.trim();
    if (q.length < 2) return [];

    const proximity = resolveDrcProximity({
      lat: opts?.centerLat,
      lng: opts?.centerLng,
      city: opts?.city,
    });
    const limit = Math.min(opts?.limit ?? 10, 10);
    const poiCategoryIds = opts?.poiCategory
      ? poiCategorySpec(opts.poiCategory).mapboxIds.join(',')
      : undefined;

    const searchBoxHits = await this.searchBox(q, proximity, limit, poiCategoryIds);
    if (searchBoxHits.length > 0) {
      return searchBoxHits.map((p) =>
        p.category || !opts?.poiCategory ? p : { ...p, category: opts.poiCategory },
      );
    }

    this.logger.debug('Search Box empty — falling back to Geocoding v5 (addresses only)');
    return this.geocodeV5(q, proximity, limit);
  }

  /** Browse POI d'une catégorie (puces Marchés / Hôpitaux / …) sur tout le territoire RDC. */
  async searchCategory(
    category: PoiCategory,
    opts?: {
      centerLat?: number;
      centerLng?: number;
      city?: string;
      limit?: number;
    },
  ): Promise<MapboxPlace[]> {
    if (!this.enabled) return [];
    const spec = poiCategorySpec(category);
    if (spec.mapboxIds.length === 0 && spec.queries.length === 0) return [];

    const proximity = resolveDrcProximity({
      lat: opts?.centerLat,
      lng: opts?.centerLng,
      city: opts?.city,
    });
    const limit = Math.min(opts?.limit ?? 15, 25);

    const primaryId = spec.mapboxIds[0];
    const categoryHits = primaryId
      ? await this.searchBoxCategory(primaryId, proximity, limit)
      : [];
    if (categoryHits.length > 0) {
      return this.mergePlaces(
        categoryHits.map((p) => ({ ...p, category: p.category ?? category })),
        limit,
      );
    }

    const queryHits = (
      await Promise.all(
        spec.queries.slice(0, 2).map((q) =>
          this.searchBoxForward(q, proximity, SEARCHBOX_POI_TYPES, limit, spec.mapboxIds.join(',')),
        ),
      )
    ).flat();
    return this.mergePlaces(
      queryHits.map((p) => ({ ...p, category: p.category ?? category })),
      limit,
    );
  }

  /** Deux appels parallèles : POI d'abord, puis adresses / quartiers. */
  private async searchBox(
    query: string,
    proximity: { lat: number; lng: number },
    limit: number,
    poiCategoryIds?: string,
  ): Promise<MapboxPlace[]> {
    const [poiHits, placeHits] = await Promise.all([
      this.searchBoxForward(query, proximity, SEARCHBOX_POI_TYPES, limit, poiCategoryIds),
      poiCategoryIds
        ? Promise.resolve([] as MapboxPlace[])
        : this.searchBoxForward(query, proximity, SEARCHBOX_PLACE_TYPES, limit),
    ]);
    return this.mergePlaces([...poiHits, ...placeHits], limit);
  }

  private async searchBoxCategory(
    canonicalId: string,
    proximity: { lat: number; lng: number },
    limit: number,
  ): Promise<MapboxPlace[]> {
    const b = RDC_TERRITORY_BOUNDS;
    const params = new URLSearchParams({
      access_token: this.token,
      country: 'cd',
      language: 'fr',
      limit: String(limit),
      proximity: `${proximity.lng},${proximity.lat}`,
      bbox: `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`,
    });

    const data = await this.fetchJson<SearchBoxResponse>(
      `${this.searchBoxCategoryUrl}/${encodeURIComponent(canonicalId)}?${params.toString()}`,
    );
    if (!data?.features?.length) return [];

    return data.features
      .map((f) => this.mapSearchBoxFeature(f))
      .filter((p): p is MapboxPlace => p != null);
  }

  private async searchBoxForward(
    query: string,
    proximity: { lat: number; lng: number },
    types: string,
    limit: number,
    poiCategoryIds?: string,
  ): Promise<MapboxPlace[]> {
    const b = RDC_TERRITORY_BOUNDS;
    const params = new URLSearchParams({
      q: query,
      access_token: this.token,
      country: 'cd',
      language: 'fr',
      limit: String(limit),
      types,
      proximity: `${proximity.lng},${proximity.lat}`,
      bbox: `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`,
      auto_complete: 'true',
    });
    if (poiCategoryIds) params.set('poi_category', poiCategoryIds);

    const data = await this.fetchJson<SearchBoxResponse>(`${this.searchBoxUrl}?${params.toString()}`);
    if (!data?.features?.length) return [];

    return data.features
      .map((f) => this.mapSearchBoxFeature(f))
      .filter((p): p is MapboxPlace => p != null);
  }

  private async geocodeV5(
    query: string,
    proximity: { lat: number; lng: number },
    limit: number,
  ): Promise<MapboxPlace[]> {
    const b = RDC_TERRITORY_BOUNDS;
    const params = new URLSearchParams({
      access_token: this.token,
      country: 'cd',
      language: 'fr',
      limit: String(limit),
      types: GEOCODE_V5_TYPES,
      proximity: `${proximity.lng},${proximity.lat}`,
      bbox: `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`,
      autocomplete: 'true',
    });

    const encoded = encodeURIComponent(query);
    const data = await this.fetchJson<MapboxV5Response>(
      `${this.geocodeV5Url}/${encoded}.json?${params.toString()}`,
    );
    if (!data?.features?.length) return [];

    return data.features
      .map((f) => this.mapV5Feature(f))
      .filter((p): p is MapboxPlace => p != null);
  }

  private mapSearchBoxFeature(feature: SearchBoxFeature): MapboxPlace | null {
    const props = feature.properties ?? {};
    if (props.feature_type === 'category') return null;

    const countryCode = props.context?.country?.country_code;
    if (countryCode && countryCode.toUpperCase() !== 'CD') return null;

    const coords = feature.geometry?.coordinates;
    const lat = coords?.[1] ?? props.coordinates?.latitude;
    const lng = coords?.[0] ?? props.coordinates?.longitude;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const ctx = props.context ?? {};
    const commune = ctx.neighborhood?.name ?? ctx.locality?.name ?? ctx.district?.name ?? null;
    const city = ctx.place?.name ?? ctx.locality?.name ?? ctx.region?.name ?? null;
    const label =
      props.full_address ??
      [props.name, props.place_formatted].filter(Boolean).join(', ') ??
      `${lat}, ${lng}`;

    return {
      label,
      address: props.full_address ?? props.address ?? label,
      lat,
      lng,
      commune,
      city,
      featureType: props.feature_type,
      category: inferPoiCategoryFromMapbox(props.poi_category_ids, props.poi_category),
    };
  }

  private mapV5Feature(feature: MapboxV5Feature): MapboxPlace | null {
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
      featureType: feature.place_type?.[0],
    };
  }

  private mergePlaces(places: MapboxPlace[], limit: number): MapboxPlace[] {
    const seen = new Set<string>();
    const out: MapboxPlace[] = [];
    for (const p of places) {
      const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
      if (out.length >= Math.min(limit + 4, 25)) break;
    }
    return out;
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
