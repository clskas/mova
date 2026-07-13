import { Injectable } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { INTERNAL_API_KEY, resolveCityFromCoords, serviceUrl } from '@mova/shared';
import { PlatformConfigService } from '../platform/platform-config.service';

export interface DriverCandidate {
  driverId: string;
  userId: string;
  lat: number;
  lng: number;
  rating: number;
  distanceKm: number;
  score: number;
  vehicleId?: string;
}

@Injectable()
export class MatchingService {
  constructor(private platformConfig: PlatformConfigService) {}

  private cfg() {
    return this.platformConfig.get().matching;
  }

  /**
   * Recherche chauffeurs autour du point de départ.
   * Courses inter-villes : matching initial à la ville de départ ; le trajet longue distance
   * est traité comme course planifiée / long-haul côté dispatch.
   */
  async findDrivers(lat: number, lng: number, vehicleType: VehicleType, searchAttempt = 0): Promise<DriverCandidate[]> {
    const city = resolveCityFromCoords(lat, lng);
    const url = serviceUrl(
      'driver',
      `/internal/drivers/nearby?lat=${lat}&lng=${lng}&vehicleType=${vehicleType}&searchAttempt=${searchAttempt}&city=${encodeURIComponent(city)}`,
    );
    const res = await fetch(url, { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
    if (!res.ok) return [];
    return res.json();
  }

  computeRadiusKm(searchAttempt = 0): number {
    const m = this.cfg();
    return Math.min(m.initialRadiusKm + searchAttempt * m.radiusIncrementKm, m.maxRadiusKm);
  }

  getMatchingMeta(searchAttempt = 0) {
    const m = this.cfg();
    const radiusKm = this.computeRadiusKm(searchAttempt);
    return {
      radiusKm,
      nextRadiusKm: Math.min(radiusKm + m.radiusIncrementKm, m.maxRadiusKm),
      incrementIntervalSec: m.radiusIncrementIntervalSec,
      maxRadiusKm: m.maxRadiusKm,
    };
  }
}
