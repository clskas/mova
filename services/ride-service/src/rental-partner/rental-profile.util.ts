/** Default stub values when a partner first opens the rental portal. */
export const RENTAL_STUB_NAME = 'Ma location';
export const RENTAL_STUB_CITY = 'À préciser';
export const RENTAL_STUB_ADDRESS = 'Kinshasa — à compléter';
export const RENTAL_STUB_LAT = -4.3105;
export const RENTAL_STUB_LNG = 15.3032;

export function rentalNeedsProfileSetup(profile: {
  businessName: string;
  city: string;
  address: string;
}): boolean {
  const businessName = profile.businessName.trim();
  const city = profile.city.trim();
  const address = profile.address.trim();
  return (
    !businessName ||
    !city ||
    !address ||
    businessName === RENTAL_STUB_NAME ||
    city === RENTAL_STUB_CITY ||
    address === RENTAL_STUB_ADDRESS
  );
}

export function assertRentalProfileComplete(data: {
  businessName?: string;
  city?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
}): { businessName: string; city: string; address: string; lat: number; lng: number } {
  const businessName = data.businessName?.trim() ?? '';
  const city = data.city?.trim() ?? '';
  const address = data.address?.trim() ?? '';
  const lat = data.lat;
  const lng = data.lng;

  if (!businessName) {
    throw new Error("Le nom de l'activité de location est obligatoire.");
  }
  if (!city) {
    throw new Error('La ville principale est obligatoire.');
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
    businessName === RENTAL_STUB_NAME ||
    city === RENTAL_STUB_CITY ||
    address === RENTAL_STUB_ADDRESS
  ) {
    throw new Error('Complétez toutes les informations de votre activité de location.');
  }

  return { businessName, city, address, lat, lng };
}

export function stubRentalProfileCreateData(userId: string, businessName?: string) {
  return {
    userId,
    partnerType: 'INDIVIDUAL' as const,
    businessName: businessName?.trim() || RENTAL_STUB_NAME,
    city: RENTAL_STUB_CITY,
    address: RENTAL_STUB_ADDRESS,
    lat: RENTAL_STUB_LAT,
    lng: RENTAL_STUB_LNG,
    kycStatus: 'PENDING' as const,
  };
}
