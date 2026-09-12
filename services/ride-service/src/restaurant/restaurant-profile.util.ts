/** Default stub values when a partner first opens the restaurant portal. */
export const RESTAURANT_STUB_NAME = 'Mon restaurant';
export const RESTAURANT_STUB_CUISINE = 'À préciser';
export const RESTAURANT_STUB_ADDRESS = 'Kinshasa — à compléter';
export const RESTAURANT_STUB_LAT = -4.3105;
export const RESTAURANT_STUB_LNG = 15.3032;

export const COMMERCE_TYPES = ['RESTAURANT', 'SUPERMARKET', 'PHARMACY', 'BOUTIQUE'] as const;
export type CommerceTypeValue = (typeof COMMERCE_TYPES)[number];

export const COMMERCE_TYPE_LABELS_FR: Record<CommerceTypeValue, string> = {
  RESTAURANT: 'Restaurant',
  SUPERMARKET: 'Supermarché',
  PHARMACY: 'Pharmacie',
  BOUTIQUE: 'Boutique',
};

export function isCommerceType(value: unknown): value is CommerceTypeValue {
  return typeof value === 'string' && (COMMERCE_TYPES as readonly string[]).includes(value);
}

export function parseCommerceType(value: unknown, fallback: CommerceTypeValue = 'RESTAURANT'): CommerceTypeValue {
  return isCommerceType(value) ? value : fallback;
}

export function restaurantNeedsProfileSetup(restaurant: {
  name: string;
  cuisine: string;
  address: string;
}): boolean {
  const name = restaurant.name.trim();
  const cuisine = restaurant.cuisine.trim();
  const address = restaurant.address.trim();
  return (
    !name ||
    !cuisine ||
    !address ||
    name === RESTAURANT_STUB_NAME ||
    cuisine === RESTAURANT_STUB_CUISINE ||
    address === RESTAURANT_STUB_ADDRESS
  );
}

export function assertRestaurantProfileComplete(data: {
  name?: string;
  cuisine?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
}): { name: string; cuisine: string; address: string; lat: number; lng: number } {
  const name = data.name?.trim() ?? '';
  const cuisine = data.cuisine?.trim() ?? '';
  const address = data.address?.trim() ?? '';
  const lat = data.lat;
  const lng = data.lng;

  if (!name) {
    throw new Error('Le nom du restaurant est obligatoire.');
  }
  if (!cuisine) {
    throw new Error('Le type de cuisine est obligatoire.');
  }
  if (!address) {
    throw new Error("L'adresse est obligatoire.");
  }
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Renseignez la latitude et la longitude (GPS).');
  }
  if (lat < -90 || lat > 90) {
    throw new Error('Latitude invalide.');
  }
  if (lng < -180 || lng > 180) {
    throw new Error('Longitude invalide.');
  }
  if (
    name === RESTAURANT_STUB_NAME ||
    cuisine === RESTAURANT_STUB_CUISINE ||
    address === RESTAURANT_STUB_ADDRESS
  ) {
    throw new Error('Complétez toutes les informations de votre restaurant.');
  }

  return { name, cuisine, address, lat, lng };
}

export function stubRestaurantCreateData(ownerUserId: string, name?: string) {
  return {
    name: name?.trim() || RESTAURANT_STUB_NAME,
    cuisine: RESTAURANT_STUB_CUISINE,
    address: RESTAURANT_STUB_ADDRESS,
    lat: RESTAURANT_STUB_LAT,
    lng: RESTAURANT_STUB_LNG,
    ownerUserId,
    isActive: true,
    isAcceptingOrders: false,
    menuItems: [] as never[],
  };
}
