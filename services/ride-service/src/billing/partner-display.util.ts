import {
  parseFoodItemShares,
  parseOrderPlacedMetadata,
} from '../deliveries/food-delivery-settlement.util';
import { markupFeeFromPartner } from './food-catalog-markup.util';

/**
 * % markup FOOD par défaut (affichage / fallback).
 * Le règlement utilise metadata.itemsMarkupCdf / foodMarkupPercent quand présents.
 */
export const RESTAURANT_PLATFORM_PERCENT = 12;

/** Commission SENGA sur location partenaire. */
export const RENTAL_PLATFORM_PERCENT = 12;

export type RestaurantPartnerDisplay = {
  itemsSubtotalCdf: number;
  partnerNetCdf: number;
  partnerDiscountCdf: number;
  platformFeeCdf: number;
  promoCode: string | null;
  foodMarkupPercent: number;
};

export type RentalPartnerDisplay = {
  subtotalGrossCdf: number;
  partnerNetCdf: number;
  partnerDiscountCdf: number;
  platformFeeCdf: number;
  depositCdf: number;
  promoCode: string | null;
};

function platformFeeFromGross(grossCdf: number, platformPercent: number): number {
  return Math.ceil(Math.max(0, grossCdf) * (platformPercent / 100));
}

/**
 * Panier repas côté partenaire : 100 % du catalogue (hors markup client).
 * La commission SENGA affichée = markup déjà payé par le passager (pas un prélèvement sur le resto).
 */
export function computeRestaurantPartnerDisplay(input: {
  items: unknown;
  restaurantId?: string;
  events?: { event: string; metadata: unknown }[];
  deliveryDiscountCdf?: number | null;
  deliveryPromoCode?: string | null;
}): RestaurantPartnerDisplay {
  const metadata = parseOrderPlacedMetadata(input.events);
  const shares = parseFoodItemShares(input.items);
  let itemsGrossCdf = 0;
  if (input.restaurantId) {
    const match = shares.find((s) => s.restaurantId === input.restaurantId);
    itemsGrossCdf = match?.itemsGrossCdf ?? 0;
    if (itemsGrossCdf <= 0 && shares.length === 1 && !shares[0]?.restaurantId) {
      itemsGrossCdf = shares[0]?.itemsGrossCdf ?? 0;
    }
  } else {
    itemsGrossCdf = shares.reduce((sum, s) => sum + s.itemsGrossCdf, 0);
  }

  if (
    metadata.itemsPartnerSubtotalCdf != null &&
    Number.isFinite(metadata.itemsPartnerSubtotalCdf) &&
    !input.restaurantId
  ) {
    itemsGrossCdf = metadata.itemsPartnerSubtotalCdf;
  }

  const partnerDiscountCdf = Math.max(
    0,
    metadata.partnerDiscountCdf ?? input.deliveryDiscountCdf ?? metadata.discountCdf ?? 0,
  );

  const foodMarkupPercent =
    metadata.foodMarkupPercent != null && Number.isFinite(metadata.foodMarkupPercent)
      ? metadata.foodMarkupPercent
      : RESTAURANT_PLATFORM_PERCENT;

  const platformFeeCdf =
    metadata.itemsMarkupCdf != null && Number.isFinite(metadata.itemsMarkupCdf) && !input.restaurantId
      ? Math.max(0, Math.round(metadata.itemsMarkupCdf))
      : markupFeeFromPartner(itemsGrossCdf, foodMarkupPercent);

  const partnerNetCdf = Math.max(0, itemsGrossCdf - partnerDiscountCdf);
  const promoCode =
    metadata.absorbedBy === 'PARTNER' || partnerDiscountCdf > 0
      ? input.deliveryPromoCode ?? null
      : input.deliveryPromoCode ?? null;

  return {
    itemsSubtotalCdf: Math.round(itemsGrossCdf),
    partnerNetCdf: Math.round(partnerNetCdf),
    partnerDiscountCdf: Math.round(partnerDiscountCdf),
    platformFeeCdf,
    promoCode,
    foodMarkupPercent,
  };
}

/** Sous-total location + part nette partenaire (hors caution). */
export function computeRentalPartnerDisplay(input: {
  totalCdf?: number | null;
  estimatedPriceCdf?: number | null;
  discountCdf?: number | null;
  depositCdf?: number | null;
  promoCode?: string | null;
}): RentalPartnerDisplay {
  const totalPaid = input.totalCdf ?? input.estimatedPriceCdf ?? 0;
  const depositCdf = Math.max(0, input.depositCdf ?? 0);
  const partnerDiscountCdf = Math.max(0, input.discountCdf ?? 0);
  const subtotalAfterDiscount = Math.max(0, totalPaid - depositCdf);
  const subtotalGrossCdf = subtotalAfterDiscount + partnerDiscountCdf;
  const platformFeeCdf = platformFeeFromGross(subtotalGrossCdf, RENTAL_PLATFORM_PERCENT);
  const partnerNetCdf = Math.max(0, subtotalGrossCdf - platformFeeCdf - partnerDiscountCdf);

  return {
    subtotalGrossCdf: Math.round(subtotalGrossCdf),
    partnerNetCdf: Math.round(partnerNetCdf),
    partnerDiscountCdf: Math.round(partnerDiscountCdf),
    platformFeeCdf,
    depositCdf: Math.round(depositCdf),
    promoCode: input.promoCode ?? null,
  };
}
