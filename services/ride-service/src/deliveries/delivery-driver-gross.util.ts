import { DeliveryType } from '@prisma/client';

type LineItem = { unitPriceCdf?: number; priceCdf?: number; quantity?: number };

/** Part livreur sur une livraison (frais livraison pour repas, total pour colis/express). */
export function deliveryDriverGross(d: {
  type: DeliveryType;
  finalPriceCdf: number | null;
  estimatedPriceCdf: number | null;
  items: unknown;
}): number {
  const gross = d.finalPriceCdf ?? d.estimatedPriceCdf ?? 0;
  if (d.type !== DeliveryType.FOOD) return gross;
  const items = d.items;
  if (!Array.isArray(items)) return Math.max(3000, gross);
  let itemsTotal = 0;
  for (const entry of items) {
    if (entry && typeof entry === 'object' && 'restaurantId' in entry && Array.isArray((entry as { items?: unknown }).items)) {
      for (const sub of (entry as { items: LineItem[] }).items) {
        const qty = sub.quantity ?? 1;
        itemsTotal += (sub.unitPriceCdf ?? sub.priceCdf ?? 0) * qty;
      }
    } else {
      const row = entry as LineItem;
      const qty = row.quantity ?? 1;
      itemsTotal += (row.unitPriceCdf ?? row.priceCdf ?? 0) * qty;
    }
  }
  return Math.max(3000, gross - itemsTotal);
}
