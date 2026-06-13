/** Passerelle API unique (microservices). Toutes les routes passent par `/api/...`. */
import { authHeaders, getToken } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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

export type AdminUser = { id: string; phone?: string; role?: string; name?: string; firstName?: string; lastName?: string };
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

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const hasToken = Boolean(getToken());
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    if (hasToken) {
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        message = body.error?.message ?? message;
      } catch {
        /* ignore */
      }
      throw new ApiError(message, res.status);
    }
    return mockFor<T>(path);
  }
  return (await res.json()) as T;
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
  if (path.includes("/metrics")) {
    return {
      users: 1240,
      drivers: 86,
      rides: 312,
      completedRides: 298,
      revenueCdf: 2450000,
      openIncidents: 3,
      city: "Kinshasa",
    } as T;
  }
  if (path.includes("/users")) {
    return [
      { id: "1", phone: "+243812345678", role: "PASSENGER", name: "Marie K." },
      { id: "2", phone: "+243998765432", role: "DRIVER", name: "Jean M." },
    ] as T;
  }
  if (path.includes("/kyc/pending")) {
    return [{ id: "kyc-1", userId: "2", type: "DRIVERS_LICENSE", status: "PENDING" }] as T;
  }
  if (path.includes("/incidents")) {
    return [{ id: "inc-1", type: "PAYMENT_DISPUTE", description: "Litige paiement", status: "OPEN" }] as T;
  }
  if (path.includes("/deliveries")) {
    return [] as T;
  }
  if (path.includes("/scheduled-rides")) {
    return [] as T;
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
    city: raw.city ?? "Kinshasa",
  };
}

export function formatUserName(u: AdminUser) {
  if (u.name) return u.name;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return full || u.phone || u.id;
}
