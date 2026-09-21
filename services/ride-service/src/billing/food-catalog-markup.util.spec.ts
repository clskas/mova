import { customerPriceFromPartner, markupFeeFromPartner } from './food-catalog-markup.util';

describe('food-catalog-markup.util', () => {
  it('ajoute ceil(partner × %) au prix partenaire', () => {
    expect(markupFeeFromPartner(10000, 12)).toBe(1200);
    expect(customerPriceFromPartner(10000, 12)).toBe(11200);
  });

  it('arrondit le markup au plafond (ceil)', () => {
    expect(markupFeeFromPartner(10001, 12)).toBe(1201);
    expect(customerPriceFromPartner(10001, 12)).toBe(11202);
  });

  it('gère 0 % et montants nuls', () => {
    expect(customerPriceFromPartner(5000, 0)).toBe(5000);
    expect(customerPriceFromPartner(0, 12)).toBe(0);
  });
});
