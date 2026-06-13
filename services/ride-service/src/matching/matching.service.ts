import { Injectable } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { findServiceAreaByCoords, INTERNAL_API_KEY, MARKET_RDC, serviceUrl } from '@mova/shared';

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
  /**
   * Recherche chauffeurs autour du point de départ.
   * Courses inter-villes : matching initial à la ville de départ ; le trajet longue distance
   * est traité comme course planifiée / long-haul côté dispatch.
   */
  async findDrivers(lat: number, lng: number, vehicleType: VehicleType, searchAttempt = 0): Promise<DriverCandidate[]> {
    const city = findServiceAreaByCoords(lat, lng)?.name ?? MARKET_RDC.defaultCity;
    const url = serviceUrl(
      'driver',
      `/internal/drivers/nearby?lat=${lat}&lng=${lng}&vehicleType=${vehicleType}&searchAttempt=${searchAttempt}&city=${encodeURIComponent(city)}`,
    );
    const res = await fetch(url, { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
    if (!res.ok) return [];
    return res.json();
  }

  getMatchingMeta(searchAttempt = 0) {
    const radiusKm = Math.min(
      MARKET_RDC.matching.initialRadiusKm + searchAttempt * MARKET_RDC.matching.radiusIncrementKm,
      MARKET_RDC.matching.maxRadiusKm,
    );
    return {
      radiusKm,
      nextRadiusKm: Math.min(radiusKm + MARKET_RDC.matching.radiusIncrementKm, MARKET_RDC.matching.maxRadiusKm),
      incrementIntervalSec: MARKET_RDC.matching.radiusIncrementIntervalSec,
      maxRadiusKm: MARKET_RDC.matching.maxRadiusKm,
    };
  }
}
