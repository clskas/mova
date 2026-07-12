import {
  computeRentalPartnerDisplay,
  computeRestaurantPartnerDisplay,
} from './partner-display.util';

describe('partner-display.util', () => {
  it('computeRestaurantPartnerDisplay — panier et part nette', () => {
    const display = computeRestaurantPartnerDisplay({
      items: [{ name: 'Poulet', unitPriceCdf: 10000, quantity: 2 }],
      events: [
        {
          event: 'ORDER_PLACED',
          metadata: { itemsSubtotalCdf: 20000, partnerDiscountCdf: 2000, absorbedBy: 'PARTNER' },
        },
      ],
      deliveryPromoCode: 'RESTO10',
    });
    expect(display.itemsSubtotalCdf).toBe(20000);
    expect(display.platformFeeCdf).toBe(2400);
    expect(display.partnerDiscountCdf).toBe(2000);
    expect(display.partnerNetCdf).toBe(15600);
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
