import { HttpStatus } from '@nestjs/common';
import { PromoAbsorbedBy, PromoCode, PromoOwnerType, PromoScope } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';

/** Contexte métier pour valider qu'un code promo s'applique à la commande en cours. */
export type PromoApplyContext = {
  serviceType: 'RIDE' | 'FOOD' | 'PARCEL' | 'EXPRESS' | 'ERRAND' | 'SCHEDULED' | 'MOVING' | 'RENTAL';
  restaurantId?: string;
  rentalOwnerUserId?: string;
};

export type PromoSettlementSplit = {
  discountCdf: number;
  partnerDiscountCdf: number;
  platformDiscountCdf: number;
  absorbedBy: PromoAbsorbedBy;
};

const PLATFORM_SERVICES: PromoApplyContext['serviceType'][] = [
  'RIDE',
  'FOOD',
  'PARCEL',
  'EXPRESS',
  'ERRAND',
  'SCHEDULED',
  'MOVING',
  'RENTAL',
];

export function assertPromoApplicable(promo: PromoCode, context?: PromoApplyContext) {
  if (!context) {
    if (promo.ownerType !== PromoOwnerType.PLATFORM) {
      throw new MovaHttpException(
        MovaErrorCode.PROMO_INVALID,
        HttpStatus.BAD_REQUEST,
        'Ce code est réservé à un partenaire — indiquez le restaurant ou le véhicule concerné.',
      );
    }
    return;
  }

  if (promo.ownerType === PromoOwnerType.PLATFORM) {
    if (promo.scope !== PromoScope.ALL_PASSENGER_SERVICES) {
      throw new MovaHttpException(MovaErrorCode.PROMO_INVALID, HttpStatus.BAD_REQUEST, 'Code promo invalide pour ce service.');
    }
    if (!PLATFORM_SERVICES.includes(context.serviceType)) {
      throw new MovaHttpException(MovaErrorCode.PROMO_INVALID, HttpStatus.BAD_REQUEST, 'Code promo invalide pour ce service.');
    }
    return;
  }

  if (promo.ownerType === PromoOwnerType.RESTAURANT) {
    if (context.serviceType !== 'FOOD') {
      throw new MovaHttpException(
        MovaErrorCode.PROMO_INVALID,
        HttpStatus.BAD_REQUEST,
        'Ce code promo est valable uniquement pour les commandes repas de ce restaurant.',
      );
    }
    if (!promo.restaurantId || promo.restaurantId !== context.restaurantId) {
      throw new MovaHttpException(
        MovaErrorCode.PROMO_INVALID,
        HttpStatus.BAD_REQUEST,
        'Ce code promo ne s\'applique pas à ce restaurant.',
      );
    }
    if (promo.scope !== PromoScope.FOOD_MENU_ONLY && promo.scope !== PromoScope.FOOD_ORDER) {
      throw new MovaHttpException(MovaErrorCode.PROMO_INVALID, HttpStatus.BAD_REQUEST, 'Configuration promo restaurant invalide.');
    }
    return;
  }

  if (promo.ownerType === PromoOwnerType.RENTAL_OWNER) {
    if (context.serviceType !== 'RENTAL') {
      throw new MovaHttpException(
        MovaErrorCode.PROMO_INVALID,
        HttpStatus.BAD_REQUEST,
        'Ce code promo est valable uniquement pour la location de véhicules de ce partenaire.',
      );
    }
    if (!promo.rentalOwnerUserId || promo.rentalOwnerUserId !== context.rentalOwnerUserId) {
      throw new MovaHttpException(
        MovaErrorCode.PROMO_INVALID,
        HttpStatus.BAD_REQUEST,
        'Ce code promo ne s\'applique pas à ce loueur.',
      );
    }
    if (promo.scope !== PromoScope.RENTAL_SUBTOTAL) {
      throw new MovaHttpException(MovaErrorCode.PROMO_INVALID, HttpStatus.BAD_REQUEST, 'Configuration promo location invalide.');
    }
  }
}

/** Montant sur lequel appliquer la remise selon le périmètre. */
export function promoDiscountBaseCdf(
  promo: Pick<PromoCode, 'scope' | 'ownerType'>,
  parts: { itemsSubtotalCdf?: number; deliveryFeeCdf?: number; rentalSubtotalCdf?: number; orderTotalCdf: number },
): number {
  if (promo.ownerType === PromoOwnerType.RESTAURANT && promo.scope === PromoScope.FOOD_MENU_ONLY) {
    return parts.itemsSubtotalCdf ?? 0;
  }
  if (promo.ownerType === PromoOwnerType.RESTAURANT && promo.scope === PromoScope.FOOD_ORDER) {
    return (parts.itemsSubtotalCdf ?? 0) + (parts.deliveryFeeCdf ?? 0);
  }
  if (promo.ownerType === PromoOwnerType.RENTAL_OWNER && promo.scope === PromoScope.RENTAL_SUBTOTAL) {
    return parts.rentalSubtotalCdf ?? parts.orderTotalCdf;
  }
  return parts.orderTotalCdf;
}

/** Répartition de la remise entre MOVA et le partenaire. */
export function splitPromoDiscount(
  discountCdf: number,
  promo: Pick<PromoCode, 'absorbedBy' | 'partnerAbsorbPercent'>,
): PromoSettlementSplit {
  if (discountCdf <= 0) {
    return { discountCdf: 0, partnerDiscountCdf: 0, platformDiscountCdf: 0, absorbedBy: promo.absorbedBy };
  }
  if (promo.absorbedBy === PromoAbsorbedBy.PARTNER) {
    return { discountCdf, partnerDiscountCdf: discountCdf, platformDiscountCdf: 0, absorbedBy: promo.absorbedBy };
  }
  if (promo.absorbedBy === PromoAbsorbedBy.PLATFORM) {
    return { discountCdf, partnerDiscountCdf: 0, platformDiscountCdf: discountCdf, absorbedBy: promo.absorbedBy };
  }
  const pct = Math.min(100, Math.max(0, promo.partnerAbsorbPercent ?? 50));
  const partnerDiscountCdf = Math.round((discountCdf * pct) / 100);
  return {
    discountCdf,
    partnerDiscountCdf,
    platformDiscountCdf: discountCdf - partnerDiscountCdf,
    absorbedBy: PromoAbsorbedBy.SHARED,
  };
}

export function formatPromoRow(promo: PromoCode) {
  return {
    id: promo.id,
    code: promo.code,
    discountPercent: promo.discountPercent,
    discountCdf: promo.discountCdf,
    maxUses: promo.maxUses,
    usedCount: promo.usedCount,
    validUntil: promo.validUntil?.toISOString() ?? null,
    isActive: promo.isActive,
    ownerType: promo.ownerType,
    scope: promo.scope,
    absorbedBy: promo.absorbedBy,
    partnerAbsorbPercent: promo.partnerAbsorbPercent,
    restaurantId: promo.restaurantId,
    rentalOwnerUserId: promo.rentalOwnerUserId,
  };
}
