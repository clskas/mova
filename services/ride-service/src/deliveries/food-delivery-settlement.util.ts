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
