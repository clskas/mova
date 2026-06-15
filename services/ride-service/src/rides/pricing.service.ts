import { HttpStatus, Injectable } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import {
  buildFareBreakdown,
  FareBreakdown,
  findServiceAreaByCoords,
  formatCdf,
  MARKET_RDC,
  MovaErrorCode,
  MovaHttpException,
  resolveCityFromCoords,
} from '@mova/shared';
import { interCitySurchargeCdf } from '../common/address.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  resolveCity(pickupLat: number, pickupLng: number): string {
    return resolveCityFromCoords(pickupLat, pickupLng);
  }

  async estimateFare(
    vehicleType: VehicleType,
    distanceKm: number,
    durationMin: number,
    city?: string,
  ): Promise<FareBreakdown> {
    const resolvedCity = city ?? resolveCityFromCoords(MARKET_RDC.mapCenter.lat, MARKET_RDC.mapCenter.lng);
    let rule = await this.prisma.pricingRule.findUnique({
      where: { vehicleType_city: { vehicleType, city: resolvedCity } },
    });
    if (!rule) {
      rule = await this.prisma.pricingRule.findFirst({
        where: { vehicleType },
        orderBy: { city: 'asc' },
      });
    }
    if (!rule) throw new MovaHttpException(MovaErrorCode.PRICING_NOT_CONFIGURED, HttpStatus.SERVICE_UNAVAILABLE);
    const multiplier = this.getSurchargeMultiplier(rule);
    const baseFareCdf = rule.baseFareCdf;
    const distanceFareCdf = Math.ceil(distanceKm * rule.perKmCdf);
    const durationFareCdf = Math.ceil(durationMin * rule.perMinuteCdf);
    return buildFareBreakdown(
      vehicleType,
      distanceKm,
      durationMin,
      baseFareCdf,
      distanceFareCdf,
      durationFareCdf,
      multiplier,
      rule.minFareCdf,
    );
  }

  private getSurchargeMultiplier(rule: { peakMultiplier: number; nightMultiplier: number }): number {
    const hour = new Date().getHours();
    const isPeak = MARKET_RDC.peakHours.some((p) => hour >= p.start && hour < p.end);
    const isNight = hour >= MARKET_RDC.nightHours.start || hour < MARKET_RDC.nightHours.end;
    const { defaultPeakMultiplier, defaultNightMultiplier, combinedPeakNightMultiplier } = MARKET_RDC.pricing;
    const peakMult = rule.peakMultiplier > 1 ? rule.peakMultiplier : defaultPeakMultiplier;
    const nightMult = rule.nightMultiplier > 1 ? rule.nightMultiplier : defaultNightMultiplier;
    if (isPeak && isNight) {
      if (rule.peakMultiplier <= 1 && rule.nightMultiplier <= 1) return combinedPeakNightMultiplier;
      return Math.round(peakMult * nightMult * 100) / 100;
    }
    if (isPeak) return peakMult;
    if (isNight) return nightMult;
    return 1.0;
  }

  haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Majoration inter-villes appliquée sur une estimation existante. */
  withInterCitySurcharge(fare: FareBreakdown, isInterCity: boolean, distanceKm: number): FareBreakdown {
    if (!isInterCity) return fare;
    const interCityCdf = interCitySurchargeCdf(distanceKm);
    const totalCdf = fare.totalCdf + interCityCdf;
    const totalFormatted = formatCdf(totalCdf);
    return {
      ...fare,
      surchargeCdf: fare.surchargeCdf + interCityCdf,
      totalCdf,
      totalFormatted,
      formatted: totalFormatted,
      estimatedFareCdf: totalCdf,
      estimatedPriceCdf: totalCdf,
    };
  }
}
