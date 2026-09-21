import {
  computeRentalPartnerDisplay,
  computeRestaurantPartnerDisplay,
} from './partner-display.util';

describe('partner-display.util', () => {
  it('computeRestaurantPartnerDisplay — partenaire reçoit 100 % catalogue (markup séparé)', () => {
    const display = computeRestaurantPartnerDisplay({
      items: [
        { name: 'Poulet', partnerUnitPriceCdf: 10000, unitPriceCdf: 11200, quantity: 2 },
      ],
      events: [
        {
          event: 'ORDER_PLACED',
          metadata: {
            itemsPartnerSubtotalCdf: 20000,
            itemsMarkupCdf: 2400,
            itemsSubtotalCdf: 22400,
            foodMarkupPercent: 12,
            partnerDiscountCdf: 2000,
            absorbedBy: 'PARTNER',
          },
        },
      ],
      deliveryPromoCode: 'RESTO10',
    });
    expect(display.itemsSubtotalCdf).toBe(20000);
    expect(display.platformFeeCdf).toBe(2400);
    expect(display.partnerDiscountCdf).toBe(2000);
    expect(display.partnerNetCdf).toBe(18000);
    expect(display.foodMarkupPercent).toBe(12);
    expect(display.promoCode).toBe('RESTO10');
  });

  it('computeRentalPartnerDisplay — remise absorbée par le partenaire', () => {
    const display = computeRentalPartnerDisplay({
      totalCdf: 108000,
      depositCdf: 50000,
      discountCdf: 5000,
      promoCode: 'LOC5000',
    });
    expect(display.subtotalGrossCdf).toBe(63000);
    expect(display.partnerDiscountCdf).toBe(5000);
    expect(display.partnerNetCdf).toBe(50440);
  });
});
