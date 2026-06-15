export const MARKET_RDC = {
  country: 'CD',
  countryName: 'République Démocratique du Congo',
  currency: 'CDF',
  currencySymbol: 'FC',
  currencyLocale: 'fr-CD',
  phonePrefix: '+243',
  phoneRegex: /^\+243[0-9]{9}$/,
  /** Couverture nationale — aucune ville privilégiée par défaut. */
  coverageLabel: 'RDC',
  timezone: 'Africa/Kinshasa',
  locale: 'fr-CD',
  language: 'fr',

  operators: ['Vodacom', 'Orange', 'Airtel', 'Africell'] as const,

  mobileMoneyProviders: [
    { id: 'ORANGE_MONEY', name: 'Orange Money', color: '#FF6600' },
    { id: 'MPESA', name: 'M-Pesa (Vodacom)', color: '#E60000' },
    { id: 'AIRTEL_MONEY', name: 'Airtel Money', color: '#ED1C24' },
  ] as const,

  vehicleTypes: [
    { id: 'MOTO_TAXI', label: 'Moto-taxi', mobileId: 'MOTO', priority: 1 },
    { id: 'STANDARD', label: 'Standard', mobileId: 'STANDARD', priority: 2 },
    { id: 'COMFORT', label: 'Confort', mobileId: 'CONFORT', priority: 3 },
    { id: 'VIP', label: 'VIP', mobileId: 'VIP', priority: 4 },
  ] as const,

  /** Centre carte RDC — fallback technique uniquement (pas de ville imposée). */
  mapCenter: {
    lat: -2.88,
    lng: 23.66,
    label: 'Ma position',
  },

  matching: {
    initialRadiusKm: 2,
    radiusIncrementKm: 1,
    radiusIncrementIntervalSec: 30,
    maxRadiusKm: 10,
    acceptTimeoutSec: 30,
    scoreWeights: {
      proximity: 0.5,
      rating: 0.25,
      acceptanceRate: 0.15,
      seniority: 0.1,
    },
  },

  peakHours: [
    { start: 7, end: 9 },
    { start: 17, end: 19 },
  ],
  nightHours: { start: 22, end: 5 },

  /** Majoration livraison / course inter-villes (départ et arrivée dans des zones MOVA différentes). */
  interCity: {
    baseSurchargeCdf: 15_000,
    perKmSurchargeCdf: 500,
  },

  support: {
    whatsapp: '+243900000000',
    phone: '+243900000000',
  },
} as const;

export function formatCdf(amount: number): string {
  const formatted = new Intl.NumberFormat('fr-CD', {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${formatted} FC`;
}

export function validatePhoneRdc(phone: string): boolean {
  return MARKET_RDC.phoneRegex.test(phone);
}

export function normalizePhoneRdc(phone: string): string {
  const cleaned = phone.replace(/\s/g, '');
  if (cleaned.startsWith('0')) {
    return `+243${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith('243')) {
    return `+${cleaned}`;
  }
  return cleaned;
}
