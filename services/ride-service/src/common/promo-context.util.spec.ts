import { PromoAbsorbedBy, PromoOwnerType, PromoScope } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { assertPromoApplicable, formatPromoRow } from './promo-context.util';

function platformPromo(overrides: Partial<{ cityNames: string[] }> = {}) {
  return {
    id: 'p1',
    code: 'SENGA10',
    discountPercent: 10,
    discountCdf: null,
    maxUses: null,
    usedCount: 0,
    validUntil: null,
    isActive: true,
    ownerType: PromoOwnerType.PLATFORM,
    scope: PromoScope.ALL_PASSENGER_SERVICES,
    absorbedBy: PromoAbsorbedBy.PLATFORM,
    partnerAbsorbPercent: null,
    restaurantId: null,
    rentalOwnerUserId: null,
    cityNames: overrides.cityNames ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;
}

describe('assertPromoApplicable — villes SENGA', () => {
  it('accepte un code sans ville (valable partout)', () => {
    expect(() =>
      assertPromoApplicable(platformPromo({ cityNames: [] }), {
        serviceType: 'RIDE',
        city: 'Goma',
      }),
    ).not.toThrow();
  });

  it('accepte un code restreint dans une ville autorisée (casse ignorée)', () => {
    expect(() =>
      assertPromoApplicable(platformPromo({ cityNames: ['Kinshasa', 'Lubumbashi'] }), {
        serviceType: 'RIDE',
        city: 'kinshasa',
      }),
    ).not.toThrow();
  });

  it('rejette un code restreint hors ville', () => {
    try {
      assertPromoApplicable(platformPromo({ cityNames: ['Kinshasa'] }), {
        serviceType: 'RIDE',
        city: 'Goma',
      });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(MovaHttpException);
      expect((e as MovaHttpException).code).toBe(MovaErrorCode.PROMO_INVALID);
    }
  });

  it('rejette un code restreint sans contexte ville', () => {
    expect(() =>
      assertPromoApplicable(platformPromo({ cityNames: ['Kinshasa'] }), {
        serviceType: 'FOOD',
        restaurantId: 'r1',
      }),
    ).toThrow(MovaHttpException);
  });
});

describe('formatPromoRow', () => {
  it('expose cityNames (vide = toutes les villes)', () => {
    const row = formatPromoRow(platformPromo({ cityNames: ['Goma'] }));
    expect(row.cityNames).toEqual(['Goma']);
    expect(formatPromoRow(platformPromo()).cityNames).toEqual([]);
  });
});
