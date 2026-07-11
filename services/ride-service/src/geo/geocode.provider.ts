import { Injectable, Logger } from '@nestjs/common';
import { NominatimPlace, NominatimService } from './nominatim.service';
import { PhotonPlace, PhotonService } from './photon.service';

export type GeocodePlace = (NominatimPlace | PhotonPlace) & { provider: 'nominatim' | 'photon' };

type GeocodeSearchOpts = {
  city?: string;
  centerLat?: number;
  centerLng?: number;
  viewbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  limit?: number;
};

/**
 * Fournisseur géocodage unifié : Nominatim (OSM officiel) avec repli Photon (Komoot).
 * Photon est utilisé quand Nominatim est indisponible (réseau Docker, timeout, etc.).
 */
@Injectable()
export class GeocodeProvider {
  private readonly logger = new Logger(GeocodeProvider.name);
  private nominatimUnavailableUntil = 0;
  private readonly preferPhoton: boolean;
  private readonly circuitBreakerMs: number;

  constructor(
    private nominatim: NominatimService,
    private photon: PhotonService,
  ) {
    this.preferPhoton = process.env.GEOCODE_PREFER_PHOTON === 'true';
    this.circuitBreakerMs = parseInt(process.env.GEOCODE_CIRCUIT_BREAKER_MS ?? '300000', 10);
  }

  async search(query: string, opts?: GeocodeSearchOpts): Promise<GeocodePlace[]> {
    if (this.preferPhoton) {
      const photonHits = await this.photon.search(query, opts);
      if (photonHits.length > 0) {
        return photonHits.map((p) => ({ ...p, provider: 'photon' as const }));
      }
    }

    if (Date.now() >= this.nominatimUnavailableUntil) {
      const nominatimHits = await this.nominatim.search(query, opts);
      if (nominatimHits.length > 0) {
        return nominatimHits.map((p) => ({ ...p, provider: 'nominatim' as const }));
      }
      this.markNominatimUnavailable('empty or failed');
    } else {
      this.logger.debug('Nominatim circuit open — skipping to Photon');
    }

    const photonHits = await this.photon.search(query, opts);
    return photonHits.map((p) => ({ ...p, provider: 'photon' as const }));
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

  private markNominatimUnavailable(reason: string): void {
    this.nominatimUnavailableUntil = Date.now() + this.circuitBreakerMs;
    this.logger.warn(`Nominatim fallback to Photon (${reason}) — circuit open ${this.circuitBreakerMs / 1000}s`);
  }
}
