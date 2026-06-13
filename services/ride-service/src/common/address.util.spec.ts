import { MovaErrorCode } from '@mova/shared';
import { MovaHttpException } from '@mova/shared';
import {
  assertKinshasaDestination,
  assertServiceAreaDestination,
  assertServiceAreaPair,
  interCitySurchargeCdf,
  isKinshasaAddress,
  isServiceAreaAddress,
} from './address.util';

describe('address.util', () => {
  it('reconnaît une commune Kinshasa', () => {
    expect(isKinshasaAddress('Gombe')).toBe(true);
    expect(isKinshasaAddress('Aéroport, Kinshasa')).toBe(true);
  });

  it('reconnaît une ville desservie (Butembo)', () => {
    expect(isServiceAreaAddress('Butembo')).toBe(true);
    expect(() => assertServiceAreaDestination('Butembo')).not.toThrow();
  });

  it('rejette une adresse hors zones MOVA', () => {
    expect(isKinshasaAddress('Paris, France')).toBe(false);
    expect(() => assertKinshasaDestination('Paris, France')).toThrow(MovaHttpException);
    try {
      assertKinshasaDestination('Paris, France');
    } catch (e) {
      expect((e as MovaHttpException).getResponse()).toMatchObject({
        code: MovaErrorCode.VALIDATION_ERROR,
        message: expect.stringContaining('MOVA couvre'),
      });
    }
  });

  it('accepte des coords Kinshasa même sans commune dans le texte', () => {
    expect(() => assertKinshasaDestination('Aéroport', { lat: -4.4, lng: 15.4167 })).not.toThrow();
  });

  it('accepte des coords Lubumbashi', () => {
    expect(() =>
      assertServiceAreaDestination('Centre', { lat: -11.6647, lng: 27.4794 }),
    ).not.toThrow();
  });

  it('autorise un trajet inter-villes Kinshasa → Lubumbashi', () => {
    const pair = assertServiceAreaPair(-4.3217, 15.3125, -11.6647, 27.4794);
    expect(pair.isInterCity).toBe(true);
    expect(pair.pickupArea.name).toBe('Kinshasa');
    expect(pair.dropoffArea.name).toBe('Lubumbashi');
    expect(interCitySurchargeCdf(1600)).toBeGreaterThan(15_000);
  });

  it('identifie un trajet intra-ville', () => {
    const pair = assertServiceAreaPair(-4.32, 15.31, -4.34, 15.32);
    expect(pair.isInterCity).toBe(false);
  });

  it('rejette des coords hors zones MOVA', () => {
    expect(() => assertKinshasaDestination('Ma position', { lat: 48.8566, lng: 2.3522 })).toThrow(
      MovaHttpException,
    );
  });
});
