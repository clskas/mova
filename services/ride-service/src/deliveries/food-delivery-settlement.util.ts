export type FoodItemShare = {
  restaurantId?: string;
  itemsGrossCdf: number;
};

export type OrderPlacedMetadata = {
  itemsSubtotalCdf?: number;
  itemsPartnerSubtotalCdf?: number;
  itemsMarkupCdf?: number;
  foodMarkupPercent?: number;
  deliveryFeeCdf?: number;
  discountCdf?: number;
  absorbedBy?: string;
  partnerDiscountCdf?: number;
  platformDiscountCdf?: number;
};

type LineItem = {
  unitPriceCdf?: number;
  priceCdf?: number;
  partnerUnitPriceCdf?: number;
  quantity?: number;
};

/** Prix catalogue partenaire (hors markup SENGA) pour le règlement resto. */
function linePartnerUnit(row: LineItem): number {
  if (row.partnerUnitPriceCdf != null && Number.isFinite(Number(row.partnerUnitPriceCdf))) {
    return Number(row.partnerUnitPriceCdf);
  }
  return row.unitPriceCdf ?? row.priceCdf ?? 0;
}

function sumPartnerLineItems(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, entry) => {
    const row = entry as LineItem;
    const qty = row.quantity ?? 1;
    return sum + linePartnerUnit(row) * qty;
  }, 0);
}

export function parseFoodItemShares(items: unknown): FoodItemShare[] {
  if (!Array.isArray(items) || items.length === 0) return [{ itemsGrossCdf: 0 }];
  const first = items[0];
  if (
    first &&
    typeof first === 'object' &&
    'restaurantId' in first &&
    Array.isArray((first as { items?: unknown }).items)
  ) {
    return items.map((entry) => {
      const block = entry as { restaurantId?: string; items?: unknown };
      return {
        restaurantId: block.restaurantId,
        itemsGrossCdf: sumPartnerLineItems(block.items),
      };
    });
  }
  return [{ itemsGrossCdf: sumPartnerLineItems(items) }];
}

export function parseOrderPlacedMetadata(events: { event: string; metadata: unknown }[] | undefined): OrderPlacedMetadata {
  const placed = events?.find((e) => e.event === 'ORDER_PLACED');
  if (!placed?.metadata || typeof placed.metadata !== 'object') return {};
  const meta = placed.metadata as OrderPlacedMetadata;
  return {
    itemsSubtotalCdf: meta.itemsSubtotalCdf != null ? Number(meta.itemsSubtotalCdf) : undefined,
    itemsPartnerSubtotalCdf:
      meta.itemsPartnerSubtotalCdf != null ? Number(meta.itemsPartnerSubtotalCdf) : undefined,
    itemsMarkupCdf: meta.itemsMarkupCdf != null ? Number(meta.itemsMarkupCdf) : undefined,
    foodMarkupPercent: meta.foodMarkupPercent != null ? Number(meta.foodMarkupPercent) : undefined,
    deliveryFeeCdf: meta.deliveryFeeCdf != null ? Number(meta.deliveryFeeCdf) : undefined,
    discountCdf: meta.discountCdf != null ? Number(meta.discountCdf) : undefined,
    absorbedBy: meta.absorbedBy != null ? String(meta.absorbedBy) : undefined,
    partnerDiscountCdf: meta.partnerDiscountCdf != null ? Number(meta.partnerDiscountCdf) : undefined,
    platformDiscountCdf: meta.platformDiscountCdf != null ? Number(meta.platformDiscountCdf) : undefined,
  };
}

export function computeFoodSettlementPools(input: {
  totalPaidCdf: number;
  items: unknown;
  metadata: OrderPlacedMetadata;
}) {
  const shares = parseFoodItemShares(input.items);
  const itemsGrossTotal = shares.reduce((sum, share) => sum + share.itemsGrossCdf, 0);
  const partnerFromMeta = input.metadata.itemsPartnerSubtotalCdf;
  const partnerItemsGross =
    partnerFromMeta != null && Number.isFinite(partnerFromMeta) ? partnerFromMeta : itemsGrossTotal;
  // Sous-total client (avec markup) pour déduire les frais livraison en fallback.
  const customerItems =
    input.metadata.itemsSubtotalCdf ??
    (input.metadata.itemsMarkupCdf != null
      ? partnerItemsGross + input.metadata.itemsMarkupCdf
      : partnerItemsGross);
  const deliveryFeeGross =
    input.metadata.deliveryFeeCdf ?? Math.max(0, input.totalPaidCdf - customerItems);
  const preDiscountTotal = customerItems + (input.metadata.deliveryFeeCdf ?? deliveryFeeGross);
  const scale = preDiscountTotal > 0 ? input.totalPaidCdf / preDiscountTotal : 1;

  return {
    shares: shares.map((s) => ({
      ...s,
      // Répartir le total partenaire meta proportionnellement si multi-resto.
      itemsGrossCdf:
        partnerFromMeta != null && itemsGrossTotal > 0
          ? Math.round((s.itemsGrossCdf / itemsGrossTotal) * partnerFromMeta)
          : s.itemsGrossCdf,
    })),
    itemsGrossTotal: partnerItemsGross,
    deliveryFeeGross,
    preDiscountTotal,
    scale,
    itemsNetPool: partnerItemsGross * scale,
    deliveryNetPool: deliveryFeeGross * scale,
  };
}

export type SettlementParty = {
  restaurantId: string;
  ownerUserId: string | null;
  grossCdf: number;
  netCdf: number;
  platformFeeCdf: number;
};

export type CourierShare = {
  userId: string;
  grossCdf: number;
  netCdf: number;
  platformFeeCdf: number;
};

/**
 * Flotte resto : les frais de livraison vont au restaurant (pas au pool livreurs SENGA).
 * La commission plateforme reste inchangée.
 */
export function applyOwnCourierRouting<T extends {
  driver: CourierShare | null;
  restaurants: SettlementParty[];
}>(settlement: T, courierSource?: string | null): T {
  if (courierSource !== 'RESTAURANT' || !settlement.driver || settlement.restaurants.length === 0) {
    return settlement;
  }
  const fee = settlement.driver.netCdf;
  const feeGross = settlement.driver.grossCdf;
  const restaurants = settlement.restaurants.map((row, index) =>
    index === 0
      ? { ...row, netCdf: row.netCdf + fee, grossCdf: row.grossCdf + feeGross }
      : row,
  );
  return { ...settlement, driver: null, restaurants };
}

/** SENGA commission on an amount (rounded up), with the rate clamped to 0–100 %. */
function feeOf(grossCdf: number, percent: number): number {
  const pct = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
  return Math.ceil(Math.max(0, grossCdf) * (pct / 100));
}

/**
 * Shares of a food order (pure — checked by the balance tests).
 * - Restaurants: 100 % of the catalogue (markup model) or catalogue minus the FOOD commission
 *   (older orders); a partner-funded promo comes off the restaurant concerned.
 * - Courier: delivery fee minus the DELIVERY commission (only when there is a courier).
 * - SENGA: what is left of the amount paid, never below 0 (a bigger SENGA promo is paid by
 *   SENGA and recorded as a promo cost by the payment service).
 */
export function computeFoodShares(input: {
  totalPaidCdf: number;
  restaurants: { restaurantId: string; itemsGrossCdf: number }[];
  catalogMarkupModel: boolean;
  foodPercent: number;
  deliveryPercent: number;
  partnerDiscountCdf?: number | null;
  discountRestaurantId?: string | null;
  deliveryFeeGrossCdf: number;
  hasCourier: boolean;
}) {
  const restaurants = input.restaurants.map((r) => {
    const gross = Math.round(Math.max(0, r.itemsGrossCdf));
    const fee = input.catalogMarkupModel ? 0 : feeOf(gross, input.foodPercent);
    return { restaurantId: r.restaurantId, grossCdf: gross, netCdf: gross - fee, platformFeeCdf: fee };
  });
  const partnerDiscount = Math.max(0, Math.round(input.partnerDiscountCdf ?? 0));
  if (partnerDiscount > 0 && restaurants.length > 0) {
    const target = restaurants.find((r) => r.restaurantId === input.discountRestaurantId) ?? restaurants[0];
    target.netCdf = Math.max(0, target.netCdf - partnerDiscount);
  }
  const deliveryGross = Math.max(0, input.deliveryFeeGrossCdf);
  const courierPlatformFeeCdf = feeOf(deliveryGross, input.deliveryPercent);
  // No courier (pickup): nobody earns the delivery fee, so it is not set aside for anyone.
  const courierNetCdf = input.hasCourier ? Math.round(deliveryGross - courierPlatformFeeCdf) : 0;
  const restaurantNetTotal = restaurants.reduce((sum, r) => sum + r.netCdf, 0);
  const platformFeeCdf = Math.max(0, Math.round(input.totalPaidCdf) - restaurantNetTotal - courierNetCdf);
  return { restaurants, courierNetCdf, courierPlatformFeeCdf, platformFeeCdf };
}
