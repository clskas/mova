import {
  RESTAURANT_STUB_ADDRESS,
  RESTAURANT_STUB_CUISINE,
  RESTAURANT_STUB_NAME,
  assertRestaurantProfileComplete,
  isCommerceType,
  parseCommerceType,
  restaurantNeedsProfileSetup,
} from './restaurant-profile.util';

describe('restaurant-profile.util', () => {
  it('detects stub restaurant profile', () => {
    expect(
      restaurantNeedsProfileSetup({
        name: RESTAURANT_STUB_NAME,
        cuisine: RESTAURANT_STUB_CUISINE,
        address: RESTAURANT_STUB_ADDRESS,
      }),
    ).toBe(true);
  });

  it('accepts completed restaurant profile', () => {
    expect(
      restaurantNeedsProfileSetup({
        name: 'Chez Flore',
        cuisine: 'Congolais',
        address: 'Gombe, Kinshasa',
      }),
    ).toBe(false);
  });

  it('validates complete profile payload', () => {
    expect(
      assertRestaurantProfileComplete({
        name: 'Chez Flore',
        cuisine: 'Congolais',
        address: 'Gombe, Kinshasa',
        lat: -4.3217,
        lng: 15.3125,
      }),
    ).toEqual({
      name: 'Chez Flore',
      cuisine: 'Congolais',
      address: 'Gombe, Kinshasa',
      lat: -4.3217,
      lng: 15.3125,
    });
  });

  it('rejects stub values on completion', () => {
    expect(() =>
      assertRestaurantProfileComplete({
        name: RESTAURANT_STUB_NAME,
        cuisine: 'Congolais',
        address: 'Gombe',
        lat: -4.3,
        lng: 15.3,
      }),
    ).toThrow(/Complétez toutes les informations/);
  });

  it('parses commerceType values', () => {
    expect(isCommerceType('PHARMACY')).toBe(true);
    expect(isCommerceType('cafe')).toBe(false);
    expect(parseCommerceType('SUPERMARKET')).toBe('SUPERMARKET');
    expect(parseCommerceType('unknown')).toBe('RESTAURANT');
  });
});
