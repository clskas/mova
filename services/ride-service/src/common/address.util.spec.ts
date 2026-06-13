import { MovaErrorCode } from '@mova/shared';
import { MovaHttpException } from '@mova/shared';
import {
  assertKinshasaDestination,
  assertServiceAreaDestination,
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

  it('rejette des coords hors zones MOVA', () => {
    expect(() => assertKinshasaDestination('Ma position', { lat: 48.8566, lng: 2.3522 })).toThrow(
      MovaHttpException,
    );
  });
});
