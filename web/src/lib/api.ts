/** Passerelle API unique (microservices). Toutes les routes passent par `/api/...`. */
import { authHeaders } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type ApiFetchOptions = {
  /** Utiliser les données mock uniquement si la passerelle est indisponible */
  useMock?: boolean;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: ApiFetchOptions,
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const useMock = options?.useMock ?? false;

  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        message = body.error?.message ?? body.message ?? message;
      } catch {
        /* ignore */
      }
      if (useMock) return mockFor<T>(path, init);
      throw new ApiError(message, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (useMock) return mockFor<T>(path, init);
    throw e instanceof ApiError ? e : new ApiError('Réseau indisponible', 0);
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

export type Publicite = {
  id: string;
  titre: string;
  imageUrl: string;
  lien?: string | null;
  description?: string | null;
  cible?: string;
};

export type GeoSuggestion = {
  label: string;
  address?: string;
  lat: number;
  lng: number;
  city?: string;
};

export async function fetchGeoAutocomplete(query: string, city = 'Kinshasa'): Promise<GeoSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const localFallback = (): GeoSuggestion[] => {
    const districts = ['Gombe', 'Limete', 'Bandalungwa', 'Masina', 'Kintambo', 'Ngaliema', 'Kalamu', 'Ngaliema'];
    return districts
      .filter((d) => d.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 8)
      .map((d) => ({
        label: `${d}, ${city}`,
        address: `${d}, ${city}, RDC`,
        lat: -4.3217,
        lng: 15.3125,
        city,
      }));
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `${API_BASE}/api/geo/autocomplete?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return localFallback();
    const body = await res.json();
    const list = Array.isArray(body) ? body : (body as { data?: GeoSuggestion[] }).data ?? [];
    const filtered = list.filter((s) => s?.lat != null && s?.lng != null);
    return filtered.length > 0 ? filtered : localFallback();
  } catch {
    return localFallback();
  }
}

export async function fetchActivePublicites(cible?: string): Promise<Publicite[]> {
  const q = cible ? `?cible=${encodeURIComponent(cible)}` : '';
  try {
    const res = await fetch(`${API_BASE}/api/publicites${q}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Publicite[] };
    return Array.isArray(body.data) ? body.data : [];
  } catch {
    return [];
  }
}

const mockWalletTxStore: {
  id: string;
  type: string;
  amountCdf: number;
  description: string;
  reference?: string;
  createdAt: string;
}[] = [];

function recordMockWalletTx(type: string, amountCdf: number, description: string, reference?: string) {
  mockWalletTxStore.unshift({
    id: `tx-mock-${Date.now()}`,
    type,
    amountCdf,
    description,
    reference,
    createdAt: new Date().toISOString(),
  });
}

function mockFor<T>(path: string, init?: RequestInit): T {
  const method = init?.method ?? 'GET';

  if (path.includes('/auth/otp/request')) {
    return { success: true, message: 'Code OTP envoyé', mockCode: '123456' } as T;
  }
  if (path.includes('/auth/otp/verify')) {
    return {
      success: true,
      accessToken: 'mock-web-token',
      user: { id: 'mock-user', phone: '+243812345678', role: 'PASSENGER' },
    } as T;
  }
  if (path.includes('/rides/history')) {
    return [
      { id: '1', pickupAddress: 'Gombe', dropoffAddress: 'Limete', priceCdf: 7500, status: 'COMPLETED' },
      { id: '2', pickupAddress: 'Bandal', dropoffAddress: 'Kintambo', priceCdf: 12000, status: 'COMPLETED' },
    ] as T;
  }
  if (path.includes('/rides/estimate')) {
    return { priceCdf: 8500, estimatedFareCdf: 8500, distanceKm: 3.2, durationMin: 12 } as T;
  }
  if (path.includes('/rides') && method === 'POST') {
    return { id: `ride-${Date.now()}`, status: 'SEARCHING', priceCdf: 8500 } as T;
  }
  if (path.includes('/deliveries/parcel/estimate') && method === 'POST') {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const base = { LIGHT: 5000, MEDIUM: 8000, HEAVY: 12000, VERY_HEAVY: 18000 }[body.weightCategory as string] ?? 5000;
    return { estimatedPriceCdf: base, currency: 'CDF' } as T;
  }
  if (path.includes('/deliveries/parcel') && method === 'POST') {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    return {
      delivery: {
        id: `parcel-${Date.now()}`,
        status: 'CONFIRMED',
        type: 'PARCEL',
        ...body,
        priceCdf: 5000,
      },
    } as T;
  }
  if (path.includes('/express/estimate') && method === 'POST') {
    return { estimatedPriceCdf: 7500, currency: 'CDF', expressSurchargeCdf: 2000 } as T;
  }
  if (path === '/api/express' || (path.endsWith('/express') && method === 'POST')) {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    return {
      delivery: {
        id: `express-${Date.now()}`,
        status: 'PENDING',
        type: 'EXPRESS',
        ...body,
        estimatedPriceCdf: 7500,
      },
    } as T;
  }
  if (path.includes('/moving/estimate') && method === 'POST') {
    return { estimatedPriceCdf: 45000, currency: 'CDF', volumeM3: 10 } as T;
  }
  if (path.includes('/moving') && method === 'POST') {
    return { moving: { id: `moving-${Date.now()}`, status: 'PENDING' } } as T;
  }
  if (path.includes('/rental/vehicles')) {
    return {
      data: [
        { id: 'v1', name: 'Toyota Corolla', category: 'STANDARD', pricePerDayCdf: 85000 },
        { id: 'v2', name: 'Suzuki Swift', category: 'ECONOMY', pricePerDayCdf: 65000 },
      ],
    } as T;
  }
  if (path.includes('/rental/estimate') && method === 'POST') {
    return { totalPriceCdf: 170000, pricePerDayCdf: 85000, days: 2 } as T;
  }
  if (path.includes('/rental/bookings') && method === 'POST') {
    return { booking: { id: `rental-${Date.now()}`, status: 'PENDING' } } as T;
  }
  if (path.includes('/errands/estimate') && method === 'POST') {
    return { estimatedPriceCdf: 6000, currency: 'CDF' } as T;
  }
  if (path.includes('/errands') && method === 'POST') {
    return { order: { id: `errand-${Date.now()}`, status: 'PENDING' } } as T;
  }
  if (path.includes('/geo/autocomplete')) {
    const q = new URL(path, 'http://local').searchParams.get('q')?.toLowerCase() ?? '';
    const districts = ['Gombe', 'Limete', 'Bandalungwa', 'Masina', 'Kintambo', 'Ngaliema'];
    return districts
      .filter((d) => d.toLowerCase().includes(q))
      .map((d) => ({
        label: `${d}, Kinshasa`,
        address: `${d}, Kinshasa, RDC`,
        lat: -4.3217,
        lng: 15.3125,
        city: 'Kinshasa',
      })) as T;
  }
  if (path.includes('/deliveries/restaurants')) {
    return {
      data: [
        {
          id: 'rest-1',
          name: 'Chez Mamou',
          cuisine: 'Congolais',
          rating: 4.6,
          deliveryMinCdf: 3500,
          items: [
            { id: 'item-1', name: 'Poulet moambe', priceCdf: 8500 },
            { id: 'item-2', name: 'Fumbwa', priceCdf: 6000 },
          ],
        },
        {
          id: 'rest-2',
          name: 'Le Jardin',
          cuisine: 'Grillades',
          rating: 4.4,
          deliveryMinCdf: 4000,
          items: [
            { id: 'item-4', name: 'Brochettes bœuf', priceCdf: 7000 },
            { id: 'item-5', name: 'Poisson braisé', priceCdf: 11000 },
          ],
        },
      ],
    } as T;
  }
  if (path.includes('/deliveries/food') && method === 'POST') {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const items = (body.items as { priceCdf?: number; quantity?: number }[]) ?? [];
    const subtotal = items.reduce((s, i) => s + (i.priceCdf ?? 0) * (i.quantity ?? 1), 0);
    return {
      order: { id: `food-${Date.now()}`, status: 'CONFIRMED', priceCdf: subtotal + 3500, ...body },
      delivery: { id: `food-${Date.now()}`, status: 'PENDING', type: 'FOOD' },
    } as T;
  }
  if (path.includes('/deliveries/history')) {
    return {
      data: [
        {
          id: 'parcel-1',
          type: 'PARCEL',
          pickupAddress: 'Gombe',
          dropoffAddress: 'Masina',
          status: 'DELIVERED',
          priceCdf: 8000,
        },
      ],
    } as T;
  }
  if (path.includes('/wallet/top-up') || path.includes('/wallet/topup')) {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const amount = body.amountCdf ?? 10000;
    const provider = body.provider ?? 'MOCK';
    recordMockWalletTx('CREDIT', amount, `Recharge ${provider}`, `topup_${String(provider).toLowerCase()}_${Date.now()}`);
    return { success: true, balanceCdf: amount, message: `Recharge de ${amount} FC` } as T;
  }
  if (path.includes('/wallet/withdraw') && method === 'POST') {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const amount = body.amountCdf ?? 0;
    const provider = body.provider ?? 'MOBILE_MONEY';
    const phone = body.phone ?? 'Mobile Money';
    recordMockWalletTx('DEBIT', -amount, `Retrait ${provider} vers ${phone}`, `withdraw_${String(provider).toLowerCase()}_${Date.now()}`);
    return { success: true, balanceCdf: 0, message: `Retrait de ${amount} FC` } as T;
  }
  if (path.includes('/wallet/transactions')) {
    const url = new URL(path, 'http://mock.local');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);
    const slice = mockWalletTxStore.slice(offset, offset + limit);
    return { data: slice, total: mockWalletTxStore.length, limit, offset } as T;
  }
  if (path.includes('/wallet')) {
    return {
      balanceCdf: mockWalletTxStore.reduce((s, t) => s + t.amountCdf, 0),
      transactions: mockWalletTxStore,
    } as T;
  }
  if (path.includes('/carpool/estimate') && method === 'POST') {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const seats = body.seats ?? 3;
    const total = 15000;
    return { totalPriceCdf: total, pricePerSeatCdf: Math.ceil(total / seats) } as T;
  }
  if (path.includes('/carpool') && method === 'POST') {
    return { trip: { id: `carpool-${Date.now()}`, status: 'OPEN' } } as T;
  }
  if (path.includes('/carpool/') && path.endsWith('/join') && method === 'POST') {
    return { success: true } as T;
  }
  if (path.includes('/carpool')) {
    return {
      matches: [
        {
          id: 'carpool-1',
          fromAddress: 'Gombe',
          toAddress: 'Limete',
          driverName: 'Jean M.',
          availableSeats: 2,
          pricePerSeatCdf: 2500,
          departureAt: new Date(Date.now() + 86400000).toISOString(),
          passengerCount: 1,
        },
      ],
    } as T;
  }
  if (path.includes('/rides/scheduled/estimate') && method === 'POST') {
    return { estimatedPriceCdf: 9500 } as T;
  }
  if (path.includes('/rides/scheduled') && method === 'POST') {
    return { scheduledRide: { id: `sched-${Date.now()}`, status: 'SCHEDULED' } } as T;
  }
  if (path.includes('/rides/scheduled')) {
    return {
      data: [
        {
          id: 'sched-1',
          pickupAddress: 'Gombe',
          dropoffAddress: 'Aéroport Ndjili',
          scheduledAt: new Date(Date.now() + 86400000 * 2).toISOString(),
          status: 'CONFIRMED',
          priceCdf: 9500,
        },
      ],
    } as T;
  }
  return {} as T;
}

export function formatCdf(amount: number): string {
  return `${amount.toLocaleString('fr-CD')} FC`;
}

export type ReceiptSummary = {
  referenceType: string;
  referenceId: string;
  historyType?: string;
  title: string;
  amountCdf: number;
  status: string;
  createdAt: string;
  receiptNumber: string;
  serviceTypeLabel: string;
};

export type MovaReceipt = {
  receiptNumber: string;
  documentType: 'RECEIPT' | 'INVOICE';
  serviceTypeLabel: string;
  serviceLabel: string;
  lines: { label: string; amountCdf: number; kind?: string }[];
  totalCdf: number;
  customer?: { email?: string; name?: string; phone?: string };
  payment?: { methodLabel?: string; status?: string } | null;
};

function billingPath(type: string, id: string) {
  return `/api/billing/${type.toUpperCase()}/${id}`;
}

export function fetchReceiptHistory(limit = 30) {
  return apiFetch<{ data: ReceiptSummary[] }>(`/api/billing/history?limit=${limit}`);
}

export function fetchReceipt(referenceType: string, referenceId: string) {
  return apiFetch<MovaReceipt>(billingPath(referenceType, referenceId));
}

export async function fetchReceiptPdfBlob(referenceType: string, referenceId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${billingPath(referenceType, referenceId)}/pdf`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new ApiError(`PDF ${res.status}`, res.status);
  return res.blob();
}

export function sendReceiptEmail(referenceType: string, referenceId: string, email?: string) {
  return apiFetch<{ success: boolean; sentTo?: string }>(`${billingPath(referenceType, referenceId)}/email`, {
    method: 'POST',
    body: JSON.stringify(email ? { email } : {}),
  });
}

export function shareReceiptInChat(referenceType: string, referenceId: string) {
  return apiFetch<{ success: boolean }>(`${billingPath(referenceType, referenceId)}/share-chat`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function historyToBillingType(type?: string): string {
  if (type === 'PARCEL' || type === 'FOOD' || type === 'EXPRESS') return 'DELIVERY';
  return (type ?? 'RIDE').toUpperCase();
}

export function historyItemHasReceipt(status?: string, type?: string, isPaid?: boolean): boolean {
  switch (type) {
    case 'RIDE':
      return status === 'COMPLETED' && isPaid === true;
    case 'PARCEL':
    case 'FOOD':
    case 'EXPRESS':
      return status === 'DELIVERED';
    case 'ERRAND':
    case 'MOVING':
    case 'CARPOOL':
      return status === 'COMPLETED';
    case 'RENTAL':
      return ['CONFIRMED', 'IN_PROGRESS', 'RETURNED', 'CLOSED'].includes(status ?? '');
    case 'SCHEDULED':
      return status === 'COMPLETED';
    default:
      return false;
  }
}
