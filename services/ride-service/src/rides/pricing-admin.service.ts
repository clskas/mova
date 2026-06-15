import { HttpStatus, Injectable } from '@nestjs/common';
import { SurchargeType, VehicleType } from '@prisma/client';
import { MARKET_RDC, MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricingAdminService {
  constructor(private prisma: PrismaService) {}

  listRules(city?: string) {
    return this.prisma.pricingRule.findMany({
      where: city ? { city } : undefined,
      orderBy: [{ city: 'asc' }, { vehicleType: 'asc' }],
    });
  }

  async createRule(
    vehicleType: VehicleType,
    data: {
      baseFareCdf: number;
      perKmCdf: number;
      perMinuteCdf: number;
      minFareCdf: number;
      peakMultiplier?: number;
      nightMultiplier?: number;
      city?: string;
    },
  ) {
    if (!data.city) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Ville requise.');
    }
    const city = data.city;
    return this.prisma.pricingRule.upsert({
      where: { vehicleType_city: { vehicleType, city } },
      create: {
        vehicleType,
        city,
        baseFareCdf: data.baseFareCdf,
        perKmCdf: data.perKmCdf,
        perMinuteCdf: data.perMinuteCdf,
        minFareCdf: data.minFareCdf,
        peakMultiplier: data.peakMultiplier ?? 1.0,
        nightMultiplier: data.nightMultiplier ?? 1.0,
      },
      update: data,
    });
  }

  async deleteRule(vehicleType: VehicleType, city: string) {
    if (!city) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Ville requise.');
    }
    const existing = await this.prisma.pricingRule.findUnique({
      where: { vehicleType_city: { vehicleType, city } },
    });
    if (!existing) throw new MovaHttpException(MovaErrorCode.PRICING_NOT_CONFIGURED, HttpStatus.NOT_FOUND);
    return this.prisma.pricingRule.update({
      where: { vehicleType_city: { vehicleType, city } },
      data: { isActive: false },
    });
  }

  async updateRule(
    vehicleType: VehicleType,
    data: Partial<{
      baseFareCdf: number;
      perKmCdf: number;
      perMinuteCdf: number;
      minFareCdf: number;
      peakMultiplier: number;
      nightMultiplier: number;
      isActive: boolean;
      city: string;
    }>,
  ) {
    if (!data.city) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Ville requise.');
    }
    const city = data.city;
    const existing = await this.prisma.pricingRule.findUnique({
      where: { vehicleType_city: { vehicleType, city } },
    });
    if (!existing) throw new MovaHttpException(MovaErrorCode.PRICING_NOT_CONFIGURED, HttpStatus.NOT_FOUND);
    return this.prisma.pricingRule.update({
      where: { vehicleType_city: { vehicleType, city } },
      data,
    });
  }

  listSurcharges() {
    return this.prisma.serviceSurcharge.findMany({ orderBy: { type: 'asc' } });
  }

  async getSurcharge(type: SurchargeType) {
    const row = await this.prisma.serviceSurcharge.findUnique({ where: { type } });
    if (!row) throw new MovaHttpException(MovaErrorCode.PRICING_NOT_CONFIGURED, HttpStatus.NOT_FOUND);
    return row;
  }

  async updateSurcharge(
    type: SurchargeType,
    data: Partial<{ baseFeeCdf: number; multiplier: number; perUnitCdf: number | null; description: string; isActive: boolean }>,
  ) {
    await this.getSurcharge(type);
    return this.prisma.serviceSurcharge.update({ where: { type }, data });
  }

  listPromoCodes() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createPromoCode(data: {
    code: string;
    discountPercent?: number;
    discountCdf?: number;
    maxUses?: number;
    validUntil?: Date;
  }) {
    const code = data.code.trim().toUpperCase();
    if (!code) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Le code promo est obligatoire.');
    if (data.discountPercent == null && data.discountCdf == null) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Indiquez une réduction en pourcentage ou en CDF.');
    }
    return this.prisma.promoCode.create({
      data: {
        code,
        discountPercent: data.discountPercent,
        discountCdf: data.discountCdf,
        maxUses: data.maxUses,
        validUntil: data.validUntil,
      },
    });
  }

  async updatePromoCode(
    id: string,
    data: Partial<{ discountPercent: number; discountCdf: number; maxUses: number; validUntil: Date | null; isActive: boolean }>,
  ) {
    await this.getPromoCode(id);
    return this.prisma.promoCode.update({ where: { id }, data });
  }

  async getPromoCode(id: string) {
    const row = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!row) throw new MovaHttpException(MovaErrorCode.PROMO_NOT_FOUND, HttpStatus.NOT_FOUND);
    return row;
  }

  async validatePromoCode(code: string) {
    const promo = await this.prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!promo || !promo.isActive) throw new MovaHttpException(MovaErrorCode.PROMO_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (promo.validUntil && promo.validUntil < new Date()) {
      throw new MovaHttpException(MovaErrorCode.PROMO_INVALID, HttpStatus.BAD_REQUEST);
    }
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
      throw new MovaHttpException(MovaErrorCode.PROMO_INVALID, HttpStatus.BAD_REQUEST);
    }
    return promo;
  }
}
