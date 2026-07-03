import { ErrandCategory } from '@prisma/client';
import { MARKET_RDC } from '@mova/shared';

const PHARMACY_KEYWORDS = /pharmac|médic|medic|drug|para-?pharm/i;
const MARKET_KEYWORDS = /marché|marche|market|supermarch|commerce|épicer|epicer|boutique/i;

export function inferErrandCategory(pickupAddress: string, items: string[] = []): ErrandCategory {
  const text = `${pickupAddress} ${items.join(' ')}`.toLowerCase();
  if (PHARMACY_KEYWORDS.test(text)) return ErrandCategory.PHARMACY;
  if (MARKET_KEYWORDS.test(text)) return ErrandCategory.MARKET;
  return ErrandCategory.OTHER;
}

export function estimatePurchaseByCategory(category: ErrandCategory, itemCount: number): number {
  const cfg = MARKET_RDC.errand.categoryEstimates[category] ?? MARKET_RDC.errand.categoryEstimates.OTHER;
  if (itemCount <= 0) return 0;
  return Math.round(itemCount * cfg.perItemCdf);
}
