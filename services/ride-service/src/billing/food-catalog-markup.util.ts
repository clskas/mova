/**
 * Markup SENGA sur le catalogue commerce / repas (modèle Uber A) :
 * prix client = prix partenaire + ceil(partenaire × FOOD%).
 * Le partenaire reçoit 100 % de son prix catalogue.
 */

export function markupFeeFromPartner(partnerCdf: number, platformPercent: number): number {
  const gross = Math.max(0, Math.round(partnerCdf));
  const pct = Math.max(0, Number(platformPercent) || 0);
  return Math.ceil(gross * (pct / 100));
}

export function customerPriceFromPartner(partnerCdf: number, platformPercent: number): number {
  const partner = Math.max(0, Math.round(partnerCdf));
  return partner + markupFeeFromPartner(partner, platformPercent);
}

/** Applique le markup aux champs prix d'un item catalogue public (passager). */
export function applyMarkupToMenuItemPrices<T extends Record<string, unknown>>(
  item: T,
  platformPercent: number,
): T {
  const next: Record<string, unknown> = { ...item };
  const base = Number(item.unitPriceCdf ?? item.priceCdf ?? 0);
  if (Number.isFinite(base) && base > 0) {
    const customer = customerPriceFromPartner(base, platformPercent);
    next.unitPriceCdf = customer;
    if (item.priceCdf != null) next.priceCdf = customer;
  }
  if (Array.isArray(item.sizes)) {
    next.sizes = item.sizes.map((s) => {
      const row = s as Record<string, unknown>;
      const p = Number(row.priceCdf ?? row.unitPriceCdf ?? 0);
      if (!Number.isFinite(p) || p <= 0) return s;
      const c = customerPriceFromPartner(p, platformPercent);
      return { ...row, priceCdf: c, ...(row.unitPriceCdf != null ? { unitPriceCdf: c } : {}) };
    });
  }
  if (Array.isArray(item.options)) {
    next.options = item.options.map((o) => {
      const row = o as Record<string, unknown>;
      const p = Number(row.priceCdf ?? row.unitPriceCdf ?? 0);
      if (!Number.isFinite(p) || p <= 0) return o;
      const c = customerPriceFromPartner(p, platformPercent);
      return { ...row, priceCdf: c, ...(row.unitPriceCdf != null ? { unitPriceCdf: c } : {}) };
    });
  }
  if (Array.isArray(item.optionGroups)) {
    next.optionGroups = item.optionGroups.map((g) => {
      const group = g as Record<string, unknown>;
      const opts = Array.isArray(group.options) ? group.options : [];
      return {
        ...group,
        options: opts.map((o) => {
          const row = o as Record<string, unknown>;
          const p = Number(row.priceCdf ?? row.unitPriceCdf ?? 0);
          if (!Number.isFinite(p) || p <= 0) return o;
          const c = customerPriceFromPartner(p, platformPercent);
          return { ...row, priceCdf: c, ...(row.unitPriceCdf != null ? { unitPriceCdf: c } : {}) };
        }),
      };
    });
  }
  return next as T;
}

export function applyMarkupToMenuCatalog(items: unknown[], platformPercent: number): unknown[] {
  return items.map((it) =>
    it && typeof it === 'object'
      ? applyMarkupToMenuItemPrices(it as Record<string, unknown>, platformPercent)
      : it,
  );
}
