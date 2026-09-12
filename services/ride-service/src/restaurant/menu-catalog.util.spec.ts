import {
  assertOrderCatalogConstraints,
  decrementMenuStock,
  flattenMenuItems,
  normalizeMenuCatalogInput,
  parseMenuCatalog,
} from './menu-catalog.util';

describe('menu-catalog.util', () => {
  it('parses legacy flat array and preserves sizes/options', () => {
    const catalog = parseMenuCatalog([
      {
        name: 'Pizza',
        unitPriceCdf: 15000,
        sizes: [{ label: 'Grande', priceCdf: 18000 }],
        options: [{ label: 'Fromage', priceCdf: 2000 }],
      },
    ]);
    expect(catalog.items).toHaveLength(1);
    expect(catalog.items[0].sizes?.[0].label).toBe('Grande');
    expect(catalog.items[0].options?.[0].label).toBe('Fromage');
  });

  it('parses structured { categories, items }', () => {
    const catalog = parseMenuCatalog({
      categories: [{ id: 'c1', name: 'Boissons', sortOrder: 0 }],
      items: [{ name: 'Eau', unitPriceCdf: 500, categoryId: 'c1', stockQty: 12 }],
    });
    expect(catalog.categories[0].name).toBe('Boissons');
    expect(catalog.items[0].stockQty).toBe(12);
    expect(flattenMenuItems({ categories: catalog.categories, items: catalog.items })).toHaveLength(1);
  });

  it('normalize preserves stock and pharmacy flags', () => {
    const { stored, items } = normalizeMenuCatalogInput({
      categories: [{ name: 'Médicaments', sortOrder: 0 }],
      menuItems: [
        {
          name: 'Paracétamol',
          unitPriceCdf: 2000,
          stockQty: 5,
          ageRestricted: true,
          requiresPrescription: true,
        },
      ],
    });
    expect(Array.isArray(stored)).toBe(false);
    expect(items[0].requiresPrescription).toBe(true);
    expect(items[0].ageRestricted).toBe(true);
    expect(items[0].stockQty).toBe(5);
  });

  it('rejects insufficient stock and missing Rx ack', () => {
    const menu = [
      { name: 'Sirop', unitPriceCdf: 3000, stockQty: 1, requiresPrescription: true },
    ];
    expect(() =>
      assertOrderCatalogConstraints(menu, [{ name: 'Sirop', quantity: 2, prescriptionAcknowledged: true }]),
    ).toThrow(/Stock insuffisant|Rupture/);
    expect(() =>
      assertOrderCatalogConstraints(menu, [{ name: 'Sirop', quantity: 1, prescriptionAcknowledged: false }]),
    ).toThrow(/Ordonnance/);
  });

  it('decrements stock best-effort', () => {
    const next = decrementMenuStock(
      [{ name: 'Riz', unitPriceCdf: 1000, stockQty: 10 }],
      [{ name: 'Riz', quantity: 3 }],
    ) as { stockQty: number }[];
    expect(next[0].stockQty).toBe(7);
  });
});
