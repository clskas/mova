import { PromoOwnerType, PromoScope } from '@prisma/client';
import {
  promoDiscountBaseCdf,
  PromoApplyContext,
  PromoSettlementSplit,
  splitPromoDiscount,
} from './promo-context.util';
import { PromoService } from '../rides/surcharge.service';

export type PromoApplied = {
  estimatedPriceCdf: number;
  discountCdf: number;
  promoCode: string | null;
  settlement?: PromoSettlementSplit;
};

export type PromoApplyParts = {
  itemsSubtotalCdf?: number;
  deliveryFeeCdf?: number;
  rentalSubtotalCdf?: number;
};

export async function applyPromoCode(
  promo: PromoService,
  totalCdf: number,
  promoCode?: string,
  redeem = false,
  options?: { context?: PromoApplyContext; parts?: PromoApplyParts },
): Promise<PromoApplied> {
  if (!promoCode?.trim()) {
    return { estimatedPriceCdf: totalCdf, discountCdf: 0, promoCode: null };
  }
  const promoRow = redeem
    ? await promo.redeem(promoCode, options?.context)
    : await promo.peek(promoCode, options?.context);

  const base = promoDiscountBaseCdf(promoRow, {
    itemsSubtotalCdf: options?.parts?.itemsSubtotalCdf,
    deliveryFeeCdf: options?.parts?.deliveryFeeCdf,
    rentalSubtotalCdf: options?.parts?.rentalSubtotalCdf,
    orderTotalCdf: totalCdf,
  });

  const discountedBase = promo.applyDiscount(base, promoRow);
  const discountOnBase = base - discountedBase;

  let estimatedPriceCdf: number;
  if (promoRow.ownerType === PromoOwnerType.RESTAURANT && promoRow.scope === PromoScope.FOOD_MENU_ONLY) {
    const itemsSub = options?.parts?.itemsSubtotalCdf ?? totalCdf;
    const delivery = options?.parts?.deliveryFeeCdf ?? 0;
    estimatedPriceCdf = Math.max(0, itemsSub - discountOnBase) + delivery;
  } else {
    estimatedPriceCdf = Math.max(0, totalCdf - discountOnBase);
  }

  const discountCdf = totalCdf - estimatedPriceCdf;
  const settlement = splitPromoDiscount(discountCdf, promoRow);

  return {
    estimatedPriceCdf,
    discountCdf,
    promoCode: promoRow.code,
    settlement,
  };
}

export function formatPromoValidation(promo: {
  code: string;
  discountPercent?: number | null;
  discountCdf?: number | null;
  validUntil?: Date | null;
  ownerType?: string;
  scope?: string;
  absorbedBy?: string;
}) {
  return {
    code: promo.code,
    discountPercent: promo.discountPercent,
    discountCdf: promo.discountCdf,
    validUntil: promo.validUntil?.toISOString() ?? null,
    ownerType: promo.ownerType,
    scope: promo.scope,
    absorbedBy: promo.absorbedBy,
  };
}
