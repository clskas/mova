import { MovaErrorCode } from '@mova/shared';
import { MovaHttpException } from '@mova/shared';
import { assertKinshasaDestination, isKinshasaAddress } from './address.util';

describe('address.util', () => {
  it('reconnaît une commune Kinshasa', () => {
    expect(isKinshasaAddress('Gombe')).toBe(true);
    expect(isKinshasaAddress('Aéroport, Kinshasa')).toBe(true);
  });

  it('rejette une ville hors Kinshasa', () => {
    expect(isKinshasaAddress('Butembo')).toBe(false);
    expect(() => assertKinshasaDestination('Butembo')).toThrow(MovaHttpException);
    try {
      assertKinshasaDestination('Butembo');
    } catch (e) {
      expect((e as MovaHttpException).getResponse()).toMatchObject({
        code: MovaErrorCode.VALIDATION_ERROR,
        message: expect.stringContaining('Kinshasa'),
      });
    }
  });

  it('accepte des coords Kinshasa même sans commune dans le texte', () => {
    expect(() => assertKinshasaDestination('Aéroport', { lat: -4.4, lng: 15.4167 })).not.toThrow();
  });

  it('rejette des coords hors Kinshasa', () => {
    expect(() => assertKinshasaDestination('Ma position', { lat: 0.4956, lng: 29.4734 })).toThrow(
      MovaHttpException,
    );
  });
});
