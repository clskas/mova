import { ErrandCategory } from '@prisma/client';

export type ErrandCategoryEstimateSeed = {
  category: ErrandCategory;
  label: string;
  perItemCdf: number;
  keywordPattern: string | null;
  sortOrder: number;
};

export const DEFAULT_ERRAND_CATEGORY_ESTIMATES: ErrandCategoryEstimateSeed[] = [
  {
    category: ErrandCategory.PHARMACY,
    label: 'Pharmacie',
    perItemCdf: 8_000,
    keywordPattern: 'pharmac|médic|medic|drug|para-?pharm',
    sortOrder: 1,
  },
  {
    category: ErrandCategory.MARKET,
    label: 'Marché',
    perItemCdf: 3_000,
    keywordPattern: 'marché|marche|market|supermarch|commerce|épicer|epicer|boutique',
    sortOrder: 2,
  },
  {
    category: ErrandCategory.OTHER,
    label: 'Autre',
    perItemCdf: 5_000,
    keywordPattern: null,
    sortOrder: 3,
  },
];

export function inferErrandCategoryFromPatterns(
  text: string,
  rows: Array<{ category: ErrandCategory; keywordPattern: string | null }>,
): ErrandCategory {
  const haystack = text.toLowerCase();
  for (const row of rows) {
    if (row.category === ErrandCategory.OTHER || !row.keywordPattern?.trim()) continue;
    try {
      if (new RegExp(row.keywordPattern, 'i').test(haystack)) return row.category;
    } catch {
      /* invalid admin regex — skip */
    }
  }
  return ErrandCategory.OTHER;
}

/** @deprecated Utiliser ErrandCategoryEstimateService */
export function inferErrandCategory(pickupAddress: string, items: string[] = []): ErrandCategory {
  const text = `${pickupAddress} ${items.join(' ')}`;
  return inferErrandCategoryFromPatterns(text, DEFAULT_ERRAND_CATEGORY_ESTIMATES);
}

/** @deprecated Utiliser ErrandCategoryEstimateService */
export function estimatePurchaseByCategory(category: ErrandCategory, itemCount: number): number {
  if (itemCount <= 0) return 0;
  const cfg = DEFAULT_ERRAND_CATEGORY_ESTIMATES.find((r) => r.category === category)
    ?? DEFAULT_ERRAND_CATEGORY_ESTIMATES.find((r) => r.category === ErrandCategory.OTHER)!;
  return Math.round(itemCount * cfg.perItemCdf);
}
