import { HttpStatus, Injectable } from '@nestjs/common';
import { SurchargeType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { assertPromoApplicable, PromoApplyContext } from '../common/promo-context.util';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULTS: Record<SurchargeType, { baseFeeCdf: number; multiplier: number; perUnitCdf?: number }> = {
  [SurchargeType.DELIVERY_PARCEL]: { baseFeeCdf: 0, multiplier: 1.0 },
  [SurchargeType.DELIVERY_FOOD]: { baseFeeCdf: 3000, multiplier: 1.0 },
  [SurchargeType.DELIVERY_EXPRESS]: { baseFeeCdf: 0, multiplier: 1.35 },
  [SurchargeType.MOVING]: { baseFeeCdf: 15000, multiplier: 1.5, perUnitCdf: 8000 },
};

@Injectable()
export class SurchargeService {
  constructor(private prisma: PrismaService) {}

  async get(type: SurchargeType) {
    const row = await this.prisma.serviceSurcharge.findUnique({ where: { type } });
    if (row?.isActive) return row;
    const fallback = DEFAULTS[type];
    return {
      type,
      baseFeeCdf: fallback.baseFeeCdf,
      multiplier: fallback.multiplier,
      perUnitCdf: fallback.perUnitCdf ?? null,
      isActive: true,
    };
  }
}

@Injectable()
export class PromoService {
  constructor(private prisma: PrismaService) {}

  applyDiscount(priceCdf: number, promo: { discountPercent?: number | null; discountCdf?: number | null }) {
    let discount = 0;
    if (promo.discountPercent != null) discount = Math.ceil((priceCdf * promo.discountPercent) / 100);
    if (promo.discountCdf != null) discount = Math.max(discount, promo.discountCdf);
    return Math.max(0, priceCdf - discount);
  }

  async peek(code: string, context?: PromoApplyContext) {
    const promo = await this.prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!promo || !promo.isActive) throw new MovaHttpException(MovaErrorCode.PROMO_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (promo.validUntil && promo.validUntil < new Date()) {
      throw new MovaHttpException(MovaErrorCode.PROMO_INVALID, HttpStatus.BAD_REQUEST);
    }
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
      throw new MovaHttpException(MovaErrorCode.PROMO_INVALID, HttpStatus.BAD_REQUEST);
    }
    assertPromoApplicable(promo, context);
    return promo;
  }

  async redeem(code: string, context?: PromoApplyContext) {
    const promo = await this.peek(code, context);
    await this.prisma.promoCode.update({ where: { id: promo.id }, data: { usedCount: { increment: 1 } } });
    return promo;
  }
}
