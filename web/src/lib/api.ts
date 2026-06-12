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
    return mockFor<T>(path);
  }
}

function mockFor<T>(path: string): T {
  if (path.includes('/rides/history')) {
    return [
      { id: '1', pickupAddress: 'Gombe', dropoffAddress: 'Limete', priceCdf: 7500, status: 'COMPLETED' },
      { id: '2', pickupAddress: 'Bandal', dropoffAddress: 'Kintambo', priceCdf: 12000, status: 'COMPLETED' },
    ] as T;
  }
  if (path.includes('/rides/estimate')) {
    return { priceCdf: 8500, distanceKm: 3.2, durationMin: 12 } as T;
  }
  return {} as T;
}
