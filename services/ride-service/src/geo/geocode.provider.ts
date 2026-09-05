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
};

/**
 * Fournisseur géocodage unifié :
 * 1. Mapbox Search Box (POI + adresses) en parallèle de Photon (OSM)
 * 2. Nominatim si les deux sont vides
 *
 * Ne plus court-circuiter sur le premier hit Mapbox : Geocoding v5 ne
 * renvoie plus de POI, et même Search Box est lacunaire à Kinshasa.
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

    const mapboxPromise = this.mapbox.isConfigured()
      ? this.mapbox.search(query, {
          centerLat: searchOpts.centerLat,
          centerLng: searchOpts.centerLng,
          city: searchOpts.city,
          limit,
          poiCategory: searchOpts.poiCategory,
        })
      : Promise.resolve([] as MapboxPlace[]);

    const photonOsmTags = searchOpts.poiCategory
      ? poiCategorySpec(searchOpts.poiCategory).photonTags
      : undefined;
    const photonPromise = this.withTimeout(
      this.photon.search(query, { ...searchOpts, osmTags: photonOsmTags }),
      3500,
      [],
    );

    const [mapboxHits, photonHits] = await Promise.all([mapboxPromise, photonPromise]);

    const merged = this.mergePlaces([
      ...mapboxHits.map((p) => ({ ...p, provider: 'mapbox' as const })),
      ...photonHits.map((p) => ({ ...p, provider: 'photon' as const })),
    ]);
    if (merged.length > 0) return merged;

    return this.searchNominatim(query, searchOpts);
  }

  /** Browse POI par catégorie (puces Taxi/Moto) — Mapbox Search Box + Photon OSM. */
  async searchCategory(
    category: PoiCategory,
    opts?: GeocodeSearchOpts,
  ): Promise<GeocodePlace[]> {
    const limit = Math.min(opts?.limit ?? 15, 25);
    const searchOpts = { ...opts, limit };

    const mapboxPromise = this.mapbox.isConfigured()
      ? this.mapbox.searchCategory(category, {
          centerLat: searchOpts.centerLat,
          centerLng: searchOpts.centerLng,
          city: searchOpts.city,
          limit,
        })
      : Promise.resolve([] as MapboxPlace[]);

    const photonPromise = this.withTimeout(
      this.photon.searchByCategory(category, searchOpts),
      5000,
      [],
    );

    const [mapboxHits, photonHits] = await Promise.all([mapboxPromise, photonPromise]);
    const merged = this.mergePlaces([
      ...mapboxHits.map((p) => ({ ...p, provider: 'mapbox' as const, category: p.category ?? category })),
      ...photonHits.map((p) => ({ ...p, provider: 'photon' as const, category: p.category ?? category })),
    ]);
    if (merged.length >= 6) return merged;

    const fallbackQuery = poiCategorySpec(category).queries[0];
    if (!fallbackQuery) return merged;
    const nominatimHits = await this.searchNominatim(fallbackQuery, searchOpts);
    return this.mergePlaces([
      ...merged,
      ...nominatimHits.map((p) => ({ ...p, category })),
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
