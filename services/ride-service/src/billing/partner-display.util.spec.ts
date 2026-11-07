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

describe('computeRentalPartnerDisplay — rate and promo funding (audit 2026-11)', () => {
  it('uses the admin rate when given', () => {
    const d = computeRentalPartnerDisplay({ totalCdf: 100000, depositCdf: 0, platformPercent: 20 });
    expect(d.platformFeeCdf).toBe(20000);
    expect(d.partnerNetCdf).toBe(80000);
  });
  it('a promo funded by SENGA does not reduce the owner share', () => {
    // price 100 000, SENGA promo 10 000 → customer pays 90 000
    const d = computeRentalPartnerDisplay({
      totalCdf: 90000,
      depositCdf: 0,
      discountCdf: 10000,
      partnerDiscountCdf: 0,
      platformPercent: 12,
    });
    expect(d.subtotalGrossCdf).toBe(100000);
    expect(d.partnerNetCdf).toBe(88000);
    expect(d.platformFeeCdf).toBe(2000);
  });
  it('older bookings (no split) keep charging the whole promo to the owner', () => {
    const d = computeRentalPartnerDisplay({ totalCdf: 90000, depositCdf: 0, discountCdf: 10000, platformPercent: 12 });
    expect(d.partnerNetCdf).toBe(78000);
  });
});
