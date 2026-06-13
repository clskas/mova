import { HttpStatus, Injectable } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { MARKET_RDC, MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  async estimateFare(vehicleType: VehicleType, distanceKm: number, durationMin: number) {
    const rule = await this.prisma.pricingRule.findUnique({ where: { vehicleType } });
    if (!rule) throw new MovaHttpException(MovaErrorCode.PRICING_NOT_CONFIGURED, HttpStatus.SERVICE_UNAVAILABLE);
    const multiplier = this.getSurchargeMultiplier();
    const base = rule.baseFareCdf;
    const distance = Math.ceil(distanceKm * rule.perKmCdf);
    const duration = Math.ceil(durationMin * rule.perMinuteCdf);
    const subtotal = base + distance + duration;
    const total = Math.max(Math.ceil(subtotal * multiplier), rule.minFareCdf);
    return { vehicleType, baseFareCdf: base, distanceFareCdf: distance, durationFareCdf: duration, surchargeMultiplier: multiplier, estimatedFareCdf: total, formatted: `${total.toLocaleString('fr-CD')} FC`, currency: MARKET_RDC.currency };
  }

  private getSurchargeMultiplier(): number {
    const hour = new Date().getHours();
    const isPeak = MARKET_RDC.peakHours.some((p) => hour >= p.start && hour < p.end);
    const isNight = hour >= MARKET_RDC.nightHours.start || hour < MARKET_RDC.nightHours.end;
    if (isPeak && isNight) return 1.5;
    if (isPeak) return 1.3;
    if (isNight) return 1.2;
    return 1.0;
  }

  haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
