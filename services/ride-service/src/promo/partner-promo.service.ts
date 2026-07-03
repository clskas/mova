import { HttpStatus, Injectable } from '@nestjs/common';
import { PromoAbsorbedBy, PromoOwnerType, PromoScope } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { formatPromoRow } from '../common/promo-context.util';
import { PrismaService } from '../prisma/prisma.service';

export type PartnerPromoInput = {
  code: string;
  discountPercent?: number;
  discountCdf?: number;
  maxUses?: number;
  validUntil?: string | Date | null;
  scope?: PromoScope;
  absorbedBy?: PromoAbsorbedBy;
  partnerAbsorbPercent?: number;
  isActive?: boolean;
};

@Injectable()
export class PartnerPromoService {
  constructor(private prisma: PrismaService) {}

  private normalizeCode(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Le code promo est obligatoire.');
    }
    return normalized;
  }

  private validateDiscount(data: PartnerPromoInput) {
    if (data.discountPercent == null && data.discountCdf == null) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Indiquez une réduction en % ou en CDF.');
    }
    if (data.discountPercent != null && (data.discountPercent <= 0 || data.discountPercent > 100)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Le pourcentage doit être entre 1 et 100.');
    }
    if (data.discountCdf != null && data.discountCdf <= 0) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Le montant CDF doit être positif.');
    }
  }

  private parseValidUntil(validUntil?: string | Date | null) {
    if (!validUntil) return null;
    const date = validUntil instanceof Date ? validUntil : new Date(validUntil);
    if (Number.isNaN(date.getTime())) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Date de fin invalide.');
    }
    return date;
  }

  private assertSharedPercent(absorbedBy: PromoAbsorbedBy, partnerAbsorbPercent?: number) {
    if (absorbedBy !== PromoAbsorbedBy.SHARED) return;
    if (partnerAbsorbPercent == null || partnerAbsorbPercent < 0 || partnerAbsorbPercent > 100) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Indiquez le % partenaire pour une remise partagée (0–100).',
      );
    }
  }

  async listRestaurantPromos(ownerUserId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({ where: { ownerUserId, isActive: true } });
    if (!restaurant) {
      throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const rows = await this.prisma.promoCode.findMany({
      where: { ownerType: PromoOwnerType.RESTAURANT, restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' },
    });
    return { restaurant: { id: restaurant.id, name: restaurant.name }, promos: rows.map(formatPromoRow) };
  }

  async createRestaurantPromo(ownerUserId: string, data: PartnerPromoInput) {
    const restaurant = await this.prisma.restaurant.findFirst({ where: { ownerUserId, isActive: true } });
    if (!restaurant) {
      throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    this.validateDiscount(data);
    const code = this.normalizeCode(data.code);
    const scope = data.scope ?? PromoScope.FOOD_MENU_ONLY;
    if (scope !== PromoScope.FOOD_MENU_ONLY && scope !== PromoScope.FOOD_ORDER) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Périmètre repas invalide.');
    }
    const absorbedBy = data.absorbedBy ?? PromoAbsorbedBy.PARTNER;
    this.assertSharedPercent(absorbedBy, data.partnerAbsorbPercent);
    const row = await this.prisma.promoCode.create({
      data: {
        code,
        discountPercent: data.discountPercent,
        discountCdf: data.discountCdf,
        maxUses: data.maxUses,
        validUntil: this.parseValidUntil(data.validUntil),
        ownerType: PromoOwnerType.RESTAURANT,
        scope,
        absorbedBy,
        partnerAbsorbPercent: absorbedBy === PromoAbsorbedBy.SHARED ? data.partnerAbsorbPercent : null,
        restaurantId: restaurant.id,
      },
    });
    return formatPromoRow(row);
  }

  async updateRestaurantPromo(ownerUserId: string, id: string, data: Partial<PartnerPromoInput>) {
    const restaurant = await this.prisma.restaurant.findFirst({ where: { ownerUserId, isActive: true } });
    if (!restaurant) {
      throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const existing = await this.prisma.promoCode.findFirst({
      where: { id, ownerType: PromoOwnerType.RESTAURANT, restaurantId: restaurant.id },
    });
    if (!existing) throw new MovaHttpException(MovaErrorCode.PROMO_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (data.discountPercent != null || data.discountCdf != null) {
      this.validateDiscount({ code: existing.code, ...data });
    }
    const absorbedBy = data.absorbedBy ?? existing.absorbedBy;
    this.assertSharedPercent(absorbedBy, data.partnerAbsorbPercent ?? existing.partnerAbsorbPercent ?? undefined);
    const row = await this.prisma.promoCode.update({
      where: { id },
      data: {
        ...(data.discountPercent !== undefined ? { discountPercent: data.discountPercent } : {}),
        ...(data.discountCdf !== undefined ? { discountCdf: data.discountCdf } : {}),
        ...(data.maxUses !== undefined ? { maxUses: data.maxUses } : {}),
        ...(data.validUntil !== undefined ? { validUntil: this.parseValidUntil(data.validUntil) } : {}),
        ...(data.scope !== undefined ? { scope: data.scope } : {}),
        ...(data.absorbedBy !== undefined ? { absorbedBy: data.absorbedBy } : {}),
        ...(data.partnerAbsorbPercent !== undefined || data.absorbedBy !== undefined
          ? {
              partnerAbsorbPercent:
                absorbedBy === PromoAbsorbedBy.SHARED
                  ? (data.partnerAbsorbPercent ?? existing.partnerAbsorbPercent)
                  : null,
            }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    return formatPromoRow(row);
  }

  async listRentalPromos(ownerUserId: string) {
    const rows = await this.prisma.promoCode.findMany({
      where: { ownerType: PromoOwnerType.RENTAL_OWNER, rentalOwnerUserId: ownerUserId },
      orderBy: { createdAt: 'desc' },
    });
    return { promos: rows.map(formatPromoRow) };
  }

  async createRentalPromo(ownerUserId: string, data: PartnerPromoInput) {
    this.validateDiscount(data);
    const code = this.normalizeCode(data.code);
    const absorbedBy = data.absorbedBy ?? PromoAbsorbedBy.PARTNER;
    this.assertSharedPercent(absorbedBy, data.partnerAbsorbPercent);
    const row = await this.prisma.promoCode.create({
      data: {
        code,
        discountPercent: data.discountPercent,
        discountCdf: data.discountCdf,
        maxUses: data.maxUses,
        validUntil: this.parseValidUntil(data.validUntil),
        ownerType: PromoOwnerType.RENTAL_OWNER,
        scope: PromoScope.RENTAL_SUBTOTAL,
        absorbedBy,
        partnerAbsorbPercent: absorbedBy === PromoAbsorbedBy.SHARED ? data.partnerAbsorbPercent : null,
        rentalOwnerUserId: ownerUserId,
      },
    });
    return formatPromoRow(row);
  }

  async updateRentalPromo(ownerUserId: string, id: string, data: Partial<PartnerPromoInput>) {
    const existing = await this.prisma.promoCode.findFirst({
      where: { id, ownerType: PromoOwnerType.RENTAL_OWNER, rentalOwnerUserId: ownerUserId },
    });
    if (!existing) throw new MovaHttpException(MovaErrorCode.PROMO_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (data.discountPercent != null || data.discountCdf != null) {
      this.validateDiscount({ code: existing.code, ...data });
    }
    const absorbedBy = data.absorbedBy ?? existing.absorbedBy;
    this.assertSharedPercent(absorbedBy, data.partnerAbsorbPercent ?? existing.partnerAbsorbPercent ?? undefined);
    const row = await this.prisma.promoCode.update({
      where: { id },
      data: {
        ...(data.discountPercent !== undefined ? { discountPercent: data.discountPercent } : {}),
        ...(data.discountCdf !== undefined ? { discountCdf: data.discountCdf } : {}),
        ...(data.maxUses !== undefined ? { maxUses: data.maxUses } : {}),
        ...(data.validUntil !== undefined ? { validUntil: this.parseValidUntil(data.validUntil) } : {}),
        ...(data.absorbedBy !== undefined ? { absorbedBy: data.absorbedBy } : {}),
        ...(data.partnerAbsorbPercent !== undefined || data.absorbedBy !== undefined
          ? {
              partnerAbsorbPercent:
                absorbedBy === PromoAbsorbedBy.SHARED
                  ? (data.partnerAbsorbPercent ?? existing.partnerAbsorbPercent)
                  : null,
            }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    return formatPromoRow(row);
  }
}
