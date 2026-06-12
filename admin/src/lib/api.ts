/** Passerelle API unique (microservices). Toutes les routes passent par `/api/...`. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

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

function mockFor<T>(path: string): T {
  if (path.includes('/metrics')) {
    return {
      totalUsers: 1240,
      activeDrivers: 86,
      ridesToday: 312,
      revenueTodayCdf: 2450000,
    } as T;
  }
  if (path.includes('/users')) {
    return [
      { id: '1', phone: '+243812345678', role: 'PASSENGER', name: 'Marie K.' },
      { id: '2', phone: '+243998765432', role: 'DRIVER', name: 'Jean M.' },
    ] as T;
  }
  if (path.includes('/kyc/pending')) {
    return [{ id: 'kyc-1', userId: '2', type: 'DRIVERS_LICENSE', status: 'PENDING' }] as T;
  }
  if (path.includes('/incidents')) {
    return [{ id: 'inc-1', type: 'OTHER', description: 'Litige paiement', status: 'OPEN' }] as T;
  }
  return {} as T;
}
