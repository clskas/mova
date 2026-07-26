import {
  parseFoodItemShares,
  parseOrderPlacedMetadata,
} from '../deliveries/food-delivery-settlement.util';

/** Commission SENGA sur ventes repas (alignée CommissionServiceType.FOOD). */
export const RESTAURANT_PLATFORM_PERCENT = 12;

/** Commission SENGA sur location partenaire. */
export const RENTAL_PLATFORM_PERCENT = 12;

export type RestaurantPartnerDisplay = {
  itemsSubtotalCdf: number;
  partnerNetCdf: number;
  partnerDiscountCdf: number;
  platformFeeCdf: number;
  promoCode: string | null;
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

/** Panier repas + part nette restaurant (commission SENGA déduite, remise partenaire incluse). */
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

  const partnerDiscountCdf = Math.max(
    0,
    metadata.partnerDiscountCdf ?? input.deliveryDiscountCdf ?? metadata.discountCdf ?? 0,
  );
  const platformFeeCdf = platformFeeFromGross(itemsGrossCdf, RESTAURANT_PLATFORM_PERCENT);
  const partnerNetCdf = Math.max(0, itemsGrossCdf - platformFeeCdf - partnerDiscountCdf);
  const promoCode = metadata.absorbedBy === 'PARTNER' || partnerDiscountCdf > 0
    ? input.deliveryPromoCode ?? null
    : input.deliveryPromoCode ?? null;

  return {
    itemsSubtotalCdf: Math.round(itemsGrossCdf),
    partnerNetCdf: Math.round(partnerNetCdf),
    partnerDiscountCdf: Math.round(partnerDiscountCdf),
    platformFeeCdf,
    promoCode,
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
