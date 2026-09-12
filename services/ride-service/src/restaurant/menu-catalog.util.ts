/**
 * Unified commerce catalog stored in Restaurant.menuItems JSON.
 *
 * Compatible shapes:
 * - Legacy flat array: MenuCatalogItem[]
 * - Structured: { categories?: MenuCategory[], items: MenuCatalogItem[] }
 */

export type MenuSizeDto = {
  label: string;
  priceCdf?: number;
  unitPriceCdf?: number;
  name?: string;
};

export type MenuOptionDto = {
  label: string;
  priceCdf?: number;
  unitPriceCdf?: number;
  name?: string;
  group?: string;
};

export type MenuOptionGroupDto = {
  id?: string;
  name: string;
  min?: number;
  max?: number;
  options: MenuOptionDto[];
};

export type MenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type MenuCatalogItem = {
  id?: string;
  name: string;
  unitPriceCdf: number;
  categoryId?: string;
  imageUrl?: string;
  description?: string;
  isAvailable?: boolean;
  /** null / omitted = unlimited */
  stockQty?: number | null;
  sizes?: MenuSizeDto[];
  options?: MenuOptionDto[];
  optionGroups?: MenuOptionGroupDto[];
  ageRestricted?: boolean;
  requiresPrescription?: boolean;
};

export type MenuCatalog = {
  categories: MenuCategory[];
  items: MenuCatalogItem[];
};

function slugId(prefix: string, seed: string): string {
  const base = seed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${prefix}-${base || 'item'}-${Math.random().toString(36).slice(2, 8)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseSize(raw: unknown): MenuSizeDto | null {
  const row = asRecord(raw);
  if (!row) return null;
  const label = String(row.label ?? row.name ?? '').trim();
  if (!label) return null;
  const price = Number(row.priceCdf ?? row.unitPriceCdf);
  const out: MenuSizeDto = { label };
  if (Number.isFinite(price) && price >= 0) {
    out.priceCdf = Math.round(price);
  }
  return out;
}

function parseOption(raw: unknown, group?: string): MenuOptionDto | null {
  const row = asRecord(raw);
  if (!row) return null;
  const label = String(row.label ?? row.name ?? '').trim();
  if (!label) return null;
  const price = Number(row.priceCdf ?? row.unitPriceCdf);
  const out: MenuOptionDto = { label };
  if (Number.isFinite(price) && price >= 0) {
    out.priceCdf = Math.round(price);
  }
  const g = String(row.group ?? group ?? '').trim();
  if (g) out.group = g;
  return out;
}

function parseOptionGroup(raw: unknown): MenuOptionGroupDto | null {
  const row = asRecord(raw);
  if (!row) return null;
  const name = String(row.name ?? '').trim();
  if (!name) return null;
  const optionsRaw = Array.isArray(row.options) ? row.options : [];
  const options = optionsRaw.map((o) => parseOption(o, name)).filter((x): x is MenuOptionDto => x != null);
  if (!options.length) return null;
  const out: MenuOptionGroupDto = {
    name,
    options,
  };
  if (row.id) out.id = String(row.id);
  const min = Number(row.min);
  const max = Number(row.max);
  if (Number.isFinite(min) && min >= 0) out.min = Math.round(min);
  if (Number.isFinite(max) && max >= 0) out.max = Math.round(max);
  return out;
}

function parseItem(raw: unknown): MenuCatalogItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const name = String(row.name ?? '').trim();
  const price = Number(row.unitPriceCdf ?? row.priceCdf ?? 0);
  if (!name || !Number.isFinite(price) || price <= 0) return null;

  const item: MenuCatalogItem = {
    name,
    unitPriceCdf: Math.round(price),
    isAvailable: row.isAvailable !== false,
  };

  if (row.id) item.id = String(row.id);
  if (row.categoryId) item.categoryId = String(row.categoryId);
  if (row.imageUrl) item.imageUrl = String(row.imageUrl);
  if (row.description) item.description = String(row.description);

  if (row.stockQty === null) {
    item.stockQty = null;
  } else if (row.stockQty !== undefined) {
    const qty = Number(row.stockQty);
    if (Number.isFinite(qty) && qty >= 0) item.stockQty = Math.round(qty);
  }

  if (Array.isArray(row.sizes)) {
    const sizes = row.sizes.map(parseSize).filter((x): x is MenuSizeDto => x != null);
    if (sizes.length) item.sizes = sizes;
  }

  if (Array.isArray(row.optionGroups)) {
    const groups = row.optionGroups.map(parseOptionGroup).filter((x): x is MenuOptionGroupDto => x != null);
    if (groups.length) item.optionGroups = groups;
  }

  if (Array.isArray(row.options)) {
    const options = row.options.map((o) => parseOption(o)).filter((x): x is MenuOptionDto => x != null);
    if (options.length) item.options = options;
  } else if (item.optionGroups?.length) {
    // Flatten groups into options for passenger pricing lookup
    item.options = item.optionGroups.flatMap((g) =>
      g.options.map((o) => ({ ...o, group: o.group ?? g.name })),
    );
  }

  if (row.ageRestricted === true) item.ageRestricted = true;
  if (requiresPrescriptionFlag(row)) item.requiresPrescription = true;

  return item;
}

function requiresPrescriptionFlag(row: Record<string, unknown>): boolean {
  return row.requiresPrescription === true || row.requiresRx === true;
}

function parseCategory(raw: unknown, index: number): MenuCategory | null {
  const row = asRecord(raw);
  if (!row) return null;
  const name = String(row.name ?? '').trim();
  if (!name) return null;
  const sortOrder = Number(row.sortOrder);
  return {
    id: String(row.id ?? slugId('cat', name)),
    name,
    sortOrder: Number.isFinite(sortOrder) ? Math.round(sortOrder) : index,
  };
}

/** Extract catalog from raw menuItems JSON (array or structured object). */
export function parseMenuCatalog(raw: unknown): MenuCatalog {
  if (Array.isArray(raw)) {
    return {
      categories: [],
      items: raw.map(parseItem).filter((x): x is MenuCatalogItem => x != null),
    };
  }
  const obj = asRecord(raw);
  if (!obj) return { categories: [], items: [] };
  const categoriesRaw = Array.isArray(obj.categories) ? obj.categories : [];
  const itemsRaw = Array.isArray(obj.items)
    ? obj.items
    : Array.isArray(obj.menuItems)
      ? obj.menuItems
      : [];
  return {
    categories: categoriesRaw
      .map((c, i) => parseCategory(c, i))
      .filter((x): x is MenuCategory => x != null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    items: itemsRaw.map(parseItem).filter((x): x is MenuCatalogItem => x != null),
  };
}

/** Flat item list for pricing / passenger consumers. */
export function flattenMenuItems(raw: unknown): MenuCatalogItem[] {
  return parseMenuCatalog(raw).items;
}

function normalizeSizeInput(raw: unknown): MenuSizeDto | null {
  return parseSize(raw);
}

function normalizeOptionInput(raw: unknown, group?: string): MenuOptionDto | null {
  return parseOption(raw, group);
}

function normalizeOptionGroupInput(raw: unknown): MenuOptionGroupDto | null {
  return parseOptionGroup(raw);
}

function normalizeItemInput(raw: unknown, ensureId: boolean): MenuCatalogItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const name = String(row.name ?? '').trim();
  const price = Number(row.unitPriceCdf ?? row.priceCdf ?? 0);
  if (!name || !Number.isFinite(price) || price <= 0) return null;

  const item: MenuCatalogItem = {
    name,
    unitPriceCdf: Math.round(price),
    isAvailable: row.isAvailable !== false,
  };

  const id = String(row.id ?? '').trim();
  if (id) item.id = id;
  else if (ensureId) item.id = slugId('item', name);

  const categoryId = String(row.categoryId ?? '').trim();
  if (categoryId) item.categoryId = categoryId;

  const imageUrl = String(row.imageUrl ?? '').trim();
  if (imageUrl) item.imageUrl = imageUrl;

  const description = String(row.description ?? '').trim();
  if (description) item.description = description;

  if (row.stockQty === null) {
    item.stockQty = null;
  } else if (row.stockQty !== undefined && row.stockQty !== '') {
    const qty = Number(row.stockQty);
    if (!Number.isFinite(qty) || qty < 0) {
      throw new Error(`Stock invalide pour « ${name} ».`);
    }
    item.stockQty = Math.round(qty);
  }

  if (Array.isArray(row.sizes)) {
    const sizes = row.sizes.map(normalizeSizeInput).filter((x): x is MenuSizeDto => x != null);
    if (sizes.length) item.sizes = sizes;
  }

  if (Array.isArray(row.optionGroups)) {
    const groups = row.optionGroups
      .map(normalizeOptionGroupInput)
      .filter((x): x is MenuOptionGroupDto => x != null);
    if (groups.length) {
      item.optionGroups = groups.map((g) => ({
        ...g,
        id: g.id || slugId('grp', g.name),
      }));
      item.options = groups.flatMap((g) =>
        g.options.map((o) => ({ ...o, group: o.group ?? g.name })),
      );
    }
  } else if (Array.isArray(row.options)) {
    const options = row.options
      .map((o) => normalizeOptionInput(o))
      .filter((x): x is MenuOptionDto => x != null);
    if (options.length) item.options = options;
  }

  if (row.ageRestricted === true) item.ageRestricted = true;
  if (requiresPrescriptionFlag(row)) item.requiresPrescription = true;

  return item;
}

export type NormalizeMenuInput = {
  /** Flat array OR structured { categories, items } */
  menuItems?: unknown;
  categories?: unknown;
  items?: unknown;
};

/**
 * Normalize portal PATCH payload into storage shape.
 * - If categories present (or structured input), store `{ categories, items }`.
 * - Otherwise store a flat items array (legacy-compatible, with rich fields).
 */
export function normalizeMenuCatalogInput(input: NormalizeMenuInput): {
  stored: MenuCatalogItem[] | MenuCatalog;
  categories: MenuCategory[];
  items: MenuCatalogItem[];
} {
  const structured =
    input.menuItems != null && !Array.isArray(input.menuItems) ? asRecord(input.menuItems) : null;

  const categoriesSource =
    input.categories ??
    structured?.categories ??
    (Array.isArray(input.menuItems) ? undefined : undefined);

  const itemsSource =
    input.items ??
    structured?.items ??
    structured?.menuItems ??
    (Array.isArray(input.menuItems) ? input.menuItems : undefined);

  if (!Array.isArray(itemsSource)) {
    throw new Error('Ajoutez au moins un produit au catalogue.');
  }

  const seen = new Set<string>();
  const items: MenuCatalogItem[] = [];
  for (const raw of itemsSource) {
    const item = normalizeItemInput(raw, true);
    if (!item) continue;
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  if (!items.length) {
    throw new Error('Ajoutez au moins un produit au catalogue.');
  }

  let categories: MenuCategory[] = [];
  if (Array.isArray(categoriesSource) && categoriesSource.length) {
    categories = categoriesSource
      .map((c, i) => parseCategory(c, i))
      .filter((x): x is MenuCategory => x != null);
    // Ensure ids
    categories = categories.map((c, i) => ({
      ...c,
      id: c.id || slugId('cat', c.name),
      sortOrder: c.sortOrder ?? i,
    }));
  }

  const useStructured = categories.length > 0 || structured != null || input.categories != null;
  if (useStructured) {
    const catalog: MenuCatalog = { categories, items };
    return { stored: catalog, categories, items };
  }

  return { stored: items, categories: [], items };
}

/** Available items for public listing (passenger). */
export function publicCatalogItems(raw: unknown): MenuCatalogItem[] {
  return flattenMenuItems(raw).filter((item) => item.isAvailable !== false);
}

export type OrderLineForStock = {
  name: string;
  quantity: number;
  prescriptionAcknowledged?: boolean;
};

/**
 * Validate stock + prescription flags for an order.
 * Throws Error with French message on failure.
 */
export function assertOrderCatalogConstraints(
  rawMenu: unknown,
  lines: OrderLineForStock[],
): void {
  const items = flattenMenuItems(rawMenu);
  for (const line of lines) {
    const menuItem = items.find((m) => m.name === line.name);
    if (!menuItem) {
      throw new Error(`Produit introuvable: ${line.name}`);
    }
    if (menuItem.isAvailable === false) {
      throw new Error(`Produit indisponible: ${line.name}`);
    }
    if (typeof menuItem.stockQty === 'number') {
      if (menuItem.stockQty < line.quantity) {
        throw new Error(
          menuItem.stockQty <= 0
            ? `Rupture de stock: ${line.name}`
            : `Stock insuffisant pour « ${line.name} » (reste ${menuItem.stockQty}).`,
        );
      }
    }
    if (menuItem.requiresPrescription && !line.prescriptionAcknowledged) {
      throw new Error(
        `Ordonnance requise pour « ${line.name} ». Confirmez que vous disposez d'une ordonnance.`,
      );
    }
  }
}

/**
 * Best-effort stock decrement. Returns updated storage value (same shape as input).
 * Does not throw if item missing — caller should have validated first.
 */
export function decrementMenuStock(
  rawMenu: unknown,
  lines: OrderLineForStock[],
): unknown {
  const catalog = parseMenuCatalog(rawMenu);
  const qtyByName = new Map<string, number>();
  for (const line of lines) {
    qtyByName.set(line.name, (qtyByName.get(line.name) ?? 0) + line.quantity);
  }

  const items = catalog.items.map((item) => {
    const qty = qtyByName.get(item.name);
    if (qty == null || typeof item.stockQty !== 'number') return item;
    return { ...item, stockQty: Math.max(0, item.stockQty - qty) };
  });

  if (Array.isArray(rawMenu)) {
    return items;
  }
  const obj = asRecord(rawMenu);
  if (obj && (Array.isArray(obj.items) || Array.isArray(obj.categories))) {
    return { categories: catalog.categories, items };
  }
  // Unknown object shape — prefer structured
  if (catalog.categories.length) {
    return { categories: catalog.categories, items };
  }
  return items;
}
