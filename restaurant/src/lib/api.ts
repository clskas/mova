import { authHeaders } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export type RestaurantProfile = {
  id: string;
  name: string;
  cuisine?: string;
  address?: string;
  isAcceptingOrders?: boolean;
  prepTimeMin?: number;
  menuItems?: Array<{ name: string; unitPriceCdf?: number }>;
};

export type RestaurantOrder = {
  id: string;
  status: string;
  statusLabel?: string;
  items?: unknown;
  deliveryAddress?: string;
  estimatedPriceCdf?: number;
  createdAt?: string;
  driverAssigned?: boolean;
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? `Erreur ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function formatCdf(amount?: number) {
  if (amount == null) return "—";
  return `${amount.toLocaleString("fr-CD")} FC`;
}

export function fetchProfile() {
  return apiFetch<RestaurantProfile>("/api/restaurant/profile");
}

export function fetchOrders(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<{ restaurant: { id: string; name: string }; orders: RestaurantOrder[] }>(`/api/restaurant/orders${q}`);
}

export function confirmOrder(id: string) {
  return apiFetch(`/api/restaurant/orders/${id}/confirm`, { method: "POST" });
}

export function markOrderReady(id: string) {
  return apiFetch(`/api/restaurant/orders/${id}/ready`, { method: "POST" });
}

export function rejectOrder(id: string, reason?: string) {
  return apiFetch(`/api/restaurant/orders/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function updateMenu(data: {
  isAcceptingOrders?: boolean;
  prepTimeMin?: number;
  promotionLabel?: string;
}) {
  return apiFetch("/api/restaurant/menu", { method: "PATCH", body: JSON.stringify(data) });
}
