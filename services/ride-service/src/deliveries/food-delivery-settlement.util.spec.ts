import {
  computeFoodSettlementPools,
  parseFoodItemShares,
  parseOrderPlacedMetadata,
} from './food-delivery-settlement.util';

describe('food-delivery-settlement.util', () => {
  it('parseFoodItemShares — single restaurant', () => {
    const shares = parseFoodItemShares([
      { name: 'Poulet', unitPriceCdf: 10000, quantity: 2 },
      { name: 'Fufu', unitPriceCdf: 5000, quantity: 1 },
    ]);
    expect(shares).toEqual([{ itemsGrossCdf: 25000 }]);
  });

  it('parseFoodItemShares — multi restaurant', () => {
    const shares = parseFoodItemShares([
      { restaurantId: 'r1', items: [{ unitPriceCdf: 8000, quantity: 1 }] },
      { restaurantId: 'r2', items: [{ unitPriceCdf: 12000, quantity: 2 }] },
    ]);
    expect(shares).toEqual([
      { restaurantId: 'r1', itemsGrossCdf: 8000 },
      { restaurantId: 'r2', itemsGrossCdf: 24000 },
    ]);
  });

  it('computeFoodSettlementPools — promo proportionnelle', () => {
    const pools = computeFoodSettlementPools({
      totalPaidCdf: 27000,
      items: [{ unitPriceCdf: 20000, quantity: 1 }],
      metadata: { itemsSubtotalCdf: 20000, deliveryFeeCdf: 10000, discountCdf: 3000 },
    });
    expect(pools.preDiscountTotal).toBe(30000);
    expect(pools.scale).toBeCloseTo(0.9);
    expect(pools.itemsNetPool).toBeCloseTo(18000);
    expect(pools.deliveryNetPool).toBeCloseTo(9000);
  });

  it('parseOrderPlacedMetadata', () => {
    const meta = parseOrderPlacedMetadata([
      { event: 'ORDER_PLACED', metadata: { itemsSubtotalCdf: 15000, deliveryFeeCdf: 5000, discountCdf: 1000 } },
    ]);
    expect(meta).toEqual({ itemsSubtotalCdf: 15000, deliveryFeeCdf: 5000, discountCdf: 1000 });
  });
});
