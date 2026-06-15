/** Passerelle API unique (microservices). Toutes les routes passent par `/api/...`. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return mockFor<T>(path, init);
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

function mockFor<T>(path: string, init?: RequestInit): T {
  const method = init?.method ?? 'GET';

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
        {
          id: 'food-1',
          type: 'FOOD',
          restaurantName: 'Chez Mamou',
          deliveryAddress: 'Bandal',
          status: 'DELIVERED',
          priceCdf: 18500,
        },
      ],
    } as T;
  }
  if (path.includes('/wallet/top-up') || path.includes('/wallet/topup')) {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const amount = body.amountCdf ?? 10000;
    return { success: true, balanceCdf: 50000 + amount, message: `Recharge de ${amount} FC` } as T;
  }
  if (path.includes('/wallet')) {
    return {
      balanceCdf: 50000,
      transactions: [
        { type: 'CREDIT', amountCdf: 10000, description: 'Recharge Orange Money', createdAt: new Date().toISOString() },
        { type: 'DEBIT', amountCdf: -3500, description: 'Course taxi', createdAt: new Date(Date.now() - 86400000).toISOString() },
      ],
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
