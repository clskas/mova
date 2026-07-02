type LineItem = { unitPriceCdf?: number; priceCdf?: number; quantity?: number };

export type FoodItemShare = {
  restaurantId?: string;
  itemsGrossCdf: number;
};

export type OrderPlacedMetadata = {
  itemsSubtotalCdf?: number;
  deliveryFeeCdf?: number;
  discountCdf?: number;
};

function sumLineItems(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, entry) => {
    const row = entry as LineItem;
    const qty = row.quantity ?? 1;
    return sum + (row.unitPriceCdf ?? row.priceCdf ?? 0) * qty;
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
        itemsGrossCdf: sumLineItems(block.items),
      };
    });
  }
  return [{ itemsGrossCdf: sumLineItems(items) }];
}

export function parseOrderPlacedMetadata(events: { event: string; metadata: unknown }[] | undefined): OrderPlacedMetadata {
  const placed = events?.find((e) => e.event === 'ORDER_PLACED');
  if (!placed?.metadata || typeof placed.metadata !== 'object') return {};
  const meta = placed.metadata as OrderPlacedMetadata;
  return {
    itemsSubtotalCdf: meta.itemsSubtotalCdf != null ? Number(meta.itemsSubtotalCdf) : undefined,
    deliveryFeeCdf: meta.deliveryFeeCdf != null ? Number(meta.deliveryFeeCdf) : undefined,
    discountCdf: meta.discountCdf != null ? Number(meta.discountCdf) : undefined,
  };
}

export function computeFoodSettlementPools(input: {
  totalPaidCdf: number;
  items: unknown;
  metadata: OrderPlacedMetadata;
}) {
  const shares = parseFoodItemShares(input.items);
  const itemsGrossTotal = shares.reduce((sum, share) => sum + share.itemsGrossCdf, 0);
  const metaItems = input.metadata.itemsSubtotalCdf ?? itemsGrossTotal;
  const deliveryFeeGross =
    input.metadata.deliveryFeeCdf ?? Math.max(0, input.totalPaidCdf - itemsGrossTotal);
  const preDiscountTotal = metaItems + (input.metadata.deliveryFeeCdf ?? deliveryFeeGross);
  const scale = preDiscountTotal > 0 ? input.totalPaidCdf / preDiscountTotal : 1;

  return {
    shares,
    itemsGrossTotal,
    deliveryFeeGross,
    preDiscountTotal,
    scale,
    itemsNetPool: itemsGrossTotal * scale,
    deliveryNetPool: deliveryFeeGross * scale,
  };
}
