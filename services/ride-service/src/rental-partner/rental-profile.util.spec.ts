import {
  RENTAL_STUB_ADDRESS,
  RENTAL_STUB_CITY,
  RENTAL_STUB_NAME,
  assertRentalProfileComplete,
  rentalNeedsProfileSetup,
} from './rental-profile.util';

describe('rental-profile.util', () => {
  it('detects stub rental profile', () => {
    expect(
      rentalNeedsProfileSetup({
        businessName: RENTAL_STUB_NAME,
        city: RENTAL_STUB_CITY,
        address: RENTAL_STUB_ADDRESS,
      }),
    ).toBe(true);
  });

  it('accepts completed rental profile', () => {
    expect(
      rentalNeedsProfileSetup({
        businessName: 'SENGA Fleet Kinshasa',
        city: 'Kinshasa',
        address: 'Gombe, Kinshasa',
      }),
    ).toBe(false);
  });

  it('validates complete profile payload', () => {
    expect(
      assertRentalProfileComplete({
        businessName: 'SENGA Fleet Kinshasa',
        city: 'Kinshasa',
        address: 'Gombe, Kinshasa',
        lat: -4.3217,
        lng: 15.3125,
      }),
    ).toEqual({
      businessName: 'SENGA Fleet Kinshasa',
      city: 'Kinshasa',
      address: 'Gombe, Kinshasa',
      lat: -4.3217,
      lng: 15.3125,
    });
  });

  it('rejects stub values on completion', () => {
    expect(() =>
      assertRentalProfileComplete({
        businessName: RENTAL_STUB_NAME,
        city: 'Kinshasa',
        address: 'Gombe',
        lat: -4.3,
        lng: 15.3,
      }),
    ).toThrow(/Complétez toutes les informations/);
  });
});
