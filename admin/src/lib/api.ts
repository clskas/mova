/** Passerelle API unique (microservices). Toutes les routes passent par `/api/...`. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type AdminMetrics = {
  users?: number;
  drivers?: number;
  rides?: number;
  completedRides?: number;
  revenueCdf?: number;
  openIncidents?: number;
  city?: string;
  totalUsers?: number;
  activeDrivers?: number;
  ridesToday?: number;
  revenueTodayCdf?: number;
};

export type AdminUser = { id: string; phone?: string; role?: string; name?: string };
export type KycItem = { id: string; userId?: string; type?: string; status?: string };
export type Incident = { id: string; type?: string; description?: string; status?: string };
export type DeliveryOverview = {
  id: string;
  type?: string;
  status?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  restaurantName?: string;
  priceCdf?: number;
  createdAt?: string;
};
export type ScheduledOverview = {
  id: string;
  passengerId?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  scheduledAt?: string;
  status?: string;
  priceCdf?: number;
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return mockFor<T>(path);
  }
}

export async function checkGatewayHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function mockFor<T>(path: string): T {
  if (path.includes('/metrics')) {
    return {
      users: 1240,
      drivers: 86,
      rides: 312,
      completedRides: 298,
      revenueCdf: 2450000,
      openIncidents: 3,
      city: 'Kinshasa',
    } as T;
  }
  if (path.includes('/users')) {
    return [
      { id: '1', phone: '+243812345678', role: 'PASSENGER', name: 'Marie K.' },
      { id: '2', phone: '+243998765432', role: 'DRIVER', name: 'Jean M.' },
      { id: '3', phone: '+243900123456', role: 'PASSENGER', name: 'Paul T.' },
      { id: '4', phone: '+243811222333', role: 'DRIVER', name: 'Sophie L.' },
    ] as T;
  }
  if (path.includes('/kyc/pending')) {
    return [
      { id: 'kyc-1', userId: '2', type: 'DRIVERS_LICENSE', status: 'PENDING' },
      { id: 'kyc-2', userId: '4', type: 'VEHICLE_REGISTRATION', status: 'PENDING' },
    ] as T;
  }
  if (path.includes('/incidents')) {
    return [
      { id: 'inc-1', type: 'PAYMENT_DISPUTE', description: 'Litige paiement course #4521', status: 'OPEN' },
      { id: 'inc-2', type: 'OTHER', description: 'Retard livraison colis', status: 'OPEN' },
    ] as T;
  }
  if (path.includes('/deliveries')) {
    return [
      { id: 'del-1', type: 'PARCEL', status: 'IN_TRANSIT', pickupAddress: 'Gombe', dropoffAddress: 'Masina', priceCdf: 8000, createdAt: new Date().toISOString() },
      { id: 'del-2', type: 'FOOD', status: 'PENDING', restaurantName: 'Chez Mamou', priceCdf: 18500, createdAt: new Date().toISOString() },
    ] as T;
  }
  if (path.includes('/scheduled-rides')) {
    return [
      { id: 'sr-1', passengerId: '1', pickupAddress: 'Gombe', dropoffAddress: 'Aéroport Ndjili', scheduledAt: new Date(Date.now() + 86400000).toISOString(), status: 'CONFIRMED', priceCdf: 15000 },
      { id: 'sr-2', passengerId: '3', pickupAddress: 'Bandal', dropoffAddress: 'Limete', scheduledAt: new Date(Date.now() + 86400000 * 3).toISOString(), status: 'SCHEDULED', priceCdf: 9500 },
    ] as T;
  }
  return {} as T;
}

export function normalizeMetrics(raw: AdminMetrics) {
  return {
    totalUsers: raw.totalUsers ?? raw.users ?? 0,
    activeDrivers: raw.activeDrivers ?? raw.drivers ?? 0,
    ridesToday: raw.ridesToday ?? raw.rides ?? 0,
    revenueTodayCdf: raw.revenueTodayCdf ?? raw.revenueCdf ?? 0,
    openIncidents: raw.openIncidents ?? 0,
    city: raw.city ?? 'Kinshasa',
  };
}
