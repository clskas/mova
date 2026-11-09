import { Injectable, Logger } from '@nestjs/common';
import { MapboxPlace, MapboxService } from './mapbox.service';
import { NominatimPlace, NominatimService } from './nominatim.service';
import { PhotonPlace, PhotonService } from './photon.service';
import { poiCategorySpec, type PoiCategory } from './poi-category.map';

export type GeocodePlace = (NominatimPlace | PhotonPlace | MapboxPlace) & {
  provider: 'nominatim' | 'photon' | 'mapbox';
  category?: PoiCategory;
};

type GeocodeSearchOpts = {
  city?: string;
  centerLat?: number;
  centerLng?: number;
  viewbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  bounded?: boolean;
  limit?: number;
  poiCategory?: PoiCategory;
  /** Results the SENGA base already found (category browse: counted toward the minimum). */
  localHitCount?: number;
  /** The SENGA base already has a precise match (all the words searched): no Mapbox. */
  localPreciseHit?: boolean;
};

const STOP_WORDS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et', 'en', 'sur', 'pres', 'avenue', 'av',
  'rue', 'kinshasa', 'rdc', 'commune', 'quartier', 'q',
]);

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * A result is precise when its name / address contains every meaningful word searched
 * (« pharmacie du fleuve » → « Pharmacie du Fleuve, Gombe », not just « Gombe »).
 */
export function isPreciseMatch(query: string, label: string, address?: string | null): boolean {
  const wanted = normalizeWords(query);
  if (wanted.length === 0) return true;
  const have = new Set(normalizeWords(`${label} ${address ?? ''}`));
  return wanted.every((w) => have.has(w) || [...have].some((h) => h.length >= 4 && (h.startsWith(w) || w.startsWith(h))));
}

/** Category browse: below this many free results, Mapbox completes the list. */
const CATEGORY_MIN_RESULTS = 3;

/**
 * Address search, cheapest first (Mapbox is paid per request):
 * 1. the SENGA base (communes, POI, places added by users) — in GeoService;
 * 2. OpenStreetMap: Photon, then Nominatim if Photon is empty (free);
 * 3. Mapbox, last resort, only when nothing else was found.
 */
@Injectable()
export class GeocodeProvider {
  private readonly logger = new Logger(GeocodeProvider.name);
  private nominatimUnavailableUntil = 0;
  private readonly preferPhoton: boolean;
  private readonly circuitBreakerMs: number;

  constructor(
    private mapbox: MapboxService,
    private nominatim: NominatimService,
    private photon: PhotonService,
  ) {
    this.preferPhoton = process.env.GEOCODE_PREFER_PHOTON === 'true';
    this.circuitBreakerMs = parseInt(process.env.GEOCODE_CIRCUIT_BREAKER_MS ?? '300000', 10);
  }

  async search(query: string, opts?: GeocodeSearchOpts): Promise<GeocodePlace[]> {
    const limit = Math.min(opts?.limit ?? 10, 10);
    const searchOpts = { ...opts, limit };

    const photonOsmTags = searchOpts.poiCategory
      ? poiCategorySpec(searchOpts.poiCategory).photonTags
      : undefined;
    const photonHits = await this.withTimeout(
      this.photon.search(query, { ...searchOpts, osmTags: photonOsmTags }),
      3500,
      [] as PhotonPlace[],
    );
    let osm = this.mergePlaces(photonHits.map((p) => ({ ...p, provider: 'photon' as const })));
    if (osm.length === 0) osm = await this.searchNominatim(query, searchOpts);

    // Mapbox (paid) only when neither the SENGA base nor OpenStreetMap has a precise match:
    // nothing found, or only approximate results (e.g. the commune instead of the pharmacy).
    const osmPrecise = osm.some((p) => isPreciseMatch(query, p.label, p.address));
    if (osmPrecise || opts?.localPreciseHit === true || !this.mapbox.isConfigured()) return osm;
    const mapboxHits = await this.withTimeout(
      this.mapbox.search(query, {
        centerLat: searchOpts.centerLat,
        centerLng: searchOpts.centerLng,
        city: searchOpts.city,
        limit,
        poiCategory: searchOpts.poiCategory,
      }),
      4000,
      [] as MapboxPlace[],
    ).catch(() => [] as MapboxPlace[]);
    return this.mergePlaces([...mapboxHits.map((p) => ({ ...p, provider: 'mapbox' as const })), ...osm]);
  }

  /** Browse POI by category (Taxi/Moto chips): OpenStreetMap first, Mapbox only to complete a thin list. */
  async searchCategory(
    category: PoiCategory,
    opts?: GeocodeSearchOpts,
  ): Promise<GeocodePlace[]> {
    const limit = Math.min(opts?.limit ?? 15, 25);
    const searchOpts = { ...opts, limit };

    const photonHits = await this.withTimeout(
      this.photon.searchByCategory(category, searchOpts),
      5000,
      [] as PhotonPlace[],
    );
    let merged = this.mergePlaces(
      photonHits.map((p) => ({ ...p, provider: 'photon' as const, category: p.category ?? category })),
    );
    if (merged.length >= 6) return merged;

    const fallbackQuery = poiCategorySpec(category).queries[0];
    if (fallbackQuery) {
      const nominatimHits = await this.searchNominatim(fallbackQuery, searchOpts);
      merged = this.mergePlaces([...merged, ...nominatimHits.map((p) => ({ ...p, category }))]);
    }
    if (merged.length + (opts?.localHitCount ?? 0) >= CATEGORY_MIN_RESULTS || !this.mapbox.isConfigured()) {
      return merged;
    }

    // Last resort (paid): too few free results.
    const mapboxHits = await this.withTimeout(
      this.mapbox.searchCategory(category, {
        centerLat: searchOpts.centerLat,
        centerLng: searchOpts.centerLng,
        city: searchOpts.city,
        limit,
      }),
      4000,
      [] as MapboxPlace[],
    ).catch(() => [] as MapboxPlace[]);
    return this.mergePlaces([
      ...merged,
      ...mapboxHits.map((p) => ({ ...p, provider: 'mapbox' as const, category: p.category ?? category })),
    ]);
  }

  async reverse(lat: number, lng: number): Promise<GeocodePlace | null> {
    if (this.preferPhoton) {
      const photonPlace = await this.photon.reverse(lat, lng);
      if (photonPlace) return { ...photonPlace, provider: 'photon' };
    }

    if (Date.now() >= this.nominatimUnavailableUntil) {
      const nominatimPlace = await this.nominatim.reverse(lat, lng);
      if (nominatimPlace) return { ...nominatimPlace, provider: 'nominatim' };
      this.markNominatimUnavailable('reverse failed');
    }

    const photonPlace = await this.photon.reverse(lat, lng);
    return photonPlace ? { ...photonPlace, provider: 'photon' } : null;
  }

  private async searchNominatim(query: string, opts?: GeocodeSearchOpts): Promise<GeocodePlace[]> {
    if (Date.now() < this.nominatimUnavailableUntil) {
      this.logger.debug('Nominatim circuit open — skipping');
      return [];
    }
    const nominatimHits = await this.nominatim.search(query, opts);
    if (nominatimHits.length > 0) {
      return nominatimHits.map((p) => ({ ...p, provider: 'nominatim' as const }));
    }
    this.markNominatimUnavailable('empty or failed');
    return [];
  }

  private mergePlaces(places: GeocodePlace[]): GeocodePlace[] {
    const seen = new Set<string>();
    const out: GeocodePlace[] = [];
    for (const p of places) {
      const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
      timer.unref();
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private markNominatimUnavailable(reason: string): void {
    this.nominatimUnavailableUntil = Date.now() + this.circuitBreakerMs;
    this.logger.warn(`Nominatim fallback to Photon (${reason}) — circuit open ${this.circuitBreakerMs / 1000}s`);
  }
}
