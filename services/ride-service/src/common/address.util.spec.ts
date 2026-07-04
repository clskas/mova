import { MovaErrorCode } from '@mova/shared';
import { MovaHttpException } from '@mova/shared';
import {
  addressToCoords,
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

  it('rejette des coords hors territoire RDC', () => {
    expect(isKinshasaAddress('Paris, France')).toBe(false);
    expect(() => assertKinshasaDestination('Paris, France', { lat: 48.8566, lng: 2.3522 })).toThrow(
      MovaHttpException,
    );
    try {
      assertKinshasaDestination('Paris, France', { lat: 48.8566, lng: 2.3522 });
    } catch (e) {
      expect((e as MovaHttpException).getResponse()).toMatchObject({
        code: MovaErrorCode.VALIDATION_ERROR,
        message: expect.stringMatching(/RDC|MOVA couvre|République Démocratique/i),
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

  it('accepte des coords en zone rurale RDC (hors boîte urbaine)', () => {
    const pair = assertServiceAreaPair(-3.0, 24.0, -3.05, 24.05);
    expect(pair.isInterCity).toBe(false);
  });

  it('géocode une commune connue sur tout le territoire (sans zone imposée)', () => {
    const gombe = addressToCoords('Gombe');
    expect(gombe.lat).toBeCloseTo(-4.3217, 2);
    expect(gombe.lng).toBeCloseTo(15.3125, 2);
  });

  it('rejette des coords hors territoire RDC (texte seul)', () => {
    expect(() => assertKinshasaDestination('Ma position', { lat: 48.8566, lng: 2.3522 })).toThrow(
      MovaHttpException,
    );
  });
});
