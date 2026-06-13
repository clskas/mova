/** Passerelle API unique (microservices). Toutes les routes passent par `/api/...`. */
import { authHeaders, getToken, roleFromToken } from "./auth";
import type { AdminRole } from "./rbac";
import { isAdminRole, normalizeAdminRole } from "./rbac";

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

export type AdminUser = {
  id: string;
  phone?: string;
  role?: string;
  status?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  createdAt?: string;
};

export type AdminDriver = {
  id: string;
  userId: string;
  licenseNumber?: string | null;
  isAvailable?: boolean;
  ratingAvg?: number;
  totalRides?: number;
  kycStatus?: string;
  currentLat?: number | null;
  currentLng?: number | null;
  vehicles?: { id: string; type: string; plateNumber: string; make?: string; model?: string; isActive?: boolean }[];
  createdAt?: string;
};

export type KycItem = {
  id: string;
  userId?: string;
  type?: string;
  status?: string;
  url?: string;
  notes?: string;
  createdAt?: string;
};

export type Incident = {
  id: string;
  userId?: string;
  rideId?: string | null;
  type?: string;
  description?: string;
  status?: string;
  createdAt?: string;
};

export type DeliveryOverview = {
  id: string;
  type?: string;
  status?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  restaurantName?: string;
  priceCdf?: number;
  createdAt?: string;
  userId?: string;
  events?: { event: string; createdAt: string }[];
  timeline?: { label: string; done: boolean; at?: string }[];
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

export type RideOverview = {
  id: string;
  passengerId?: string;
  driverId?: string | null;
  status?: string;
  vehicleType?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  priceCdf?: number;
  createdAt?: string;
};

export type Restaurant = {
  id: string;
  name: string;
  cuisine?: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  imageUrl?: string | null;
  menuItems?: unknown;
  isActive?: boolean;
};

export type PricingRule = {
  id?: string;
  vehicleType: string;
  baseFareCdf: number;
  perKmCdf: number;
  perMinuteCdf: number;
  minFareCdf: number;
  peakMultiplier?: number;
  nightMultiplier?: number;
  isActive?: boolean;
};

export type DeliveryPricingRule = {
  id?: string;
  category: string;
  baseFareCdf: number;
  perKmCdf: number;
  perMinuteCdf: number;
  minFareCdf: number;
  isActive?: boolean;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  priceCdfPerMonth: number;
  benefits: string[];
  isActive: boolean;
  subscriberCount?: number;
};

export type SubscriptionRecord = {
  id: string;
  userId: string;
  planId: string;
  planName?: string;
  status: string;
  startedAt?: string;
  expiresAt?: string;
};

export type AdminSessionUser = {
  id: string;
  phone?: string;
  role: AdminRole | string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export type WalletOverview = {
  totalBalanceCdf?: number;
  pendingPayoutsCdf?: number;
  transactionsToday?: number;
};

export type Commune = {
  id: string;
  name: string;
  city?: string;
  lat?: number;
  lng?: number;
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
        message = body.error?.message ?? body.message ?? message;
      } catch {
        /* ignore */
      }
      throw new ApiError(message, res.status);
    }
    return mockFor<T>(path, init);
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

function mockFor<T>(path: string, init?: RequestInit): T {
  const method = init?.method?.toUpperCase() ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : {};

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
  if (path.match(/\/users\/[^/?]+/) && method === "GET") {
    return {
      id: "1",
      phone: "+243812345678",
      role: "PASSENGER",
      status: "ACTIVE",
      firstName: "Marie",
      lastName: "Kabongo",
    } as T;
  }
  if (path.includes("/users") && method === "PATCH") {
    return { id: "1", ...body } as T;
  }
  if (path.includes("/users")) {
    return [
      { id: "1", phone: "+243812345678", role: "PASSENGER", status: "ACTIVE", firstName: "Marie", lastName: "K." },
      { id: "2", phone: "+243998765432", role: "DRIVER", status: "ACTIVE", firstName: "Jean", lastName: "M." },
      { id: "3", phone: "+243900000001", role: "ADMIN", status: "ACTIVE", firstName: "Admin", lastName: "MOVA" },
    ] as T;
  }
  if (path.match(/\/drivers\/[^/?]+/) && method === "GET") {
    return {
      id: "d1",
      userId: "2",
      isAvailable: true,
      kycStatus: "APPROVED",
      ratingAvg: 4.8,
      totalRides: 142,
      vehicles: [{ id: "v1", type: "STANDARD", plateNumber: "KIN-1234", isActive: true }],
    } as T;
  }
  if (path.includes("/drivers") && method === "PATCH") {
    return { userId: "2", isAvailable: body.active } as T;
  }
  if (path.includes("/drivers")) {
    return [
      {
        id: "d1",
        userId: "2",
        isAvailable: true,
        kycStatus: "APPROVED",
        ratingAvg: 4.8,
        totalRides: 142,
        vehicles: [{ id: "v1", type: "STANDARD", plateNumber: "KIN-1234" }],
      },
    ] as T;
  }
  if (path.includes("/kyc/pending")) {
    return [
      {
        id: "kyc-1",
        userId: "2",
        type: "DRIVERS_LICENSE",
        status: "PENDING",
        url: "https://placehold.co/600x400/png?text=Permis",
      },
    ] as T;
  }
  if (path.includes("/kyc/") && method === "POST") {
    return { id: path.split("/").pop(), status: body.approved ? "APPROVED" : "REJECTED" } as T;
  }
  if (path.match(/\/rides\/[^/?]+/) && method === "GET") {
    return {
      id: "r1",
      passengerId: "1",
      driverId: "2",
      status: "IN_PROGRESS",
      vehicleType: "STANDARD",
      pickupAddress: "Gombe, Kinshasa",
      dropoffAddress: "Limete, Kinshasa",
      priceCdf: 8500,
      createdAt: new Date().toISOString(),
    } as T;
  }
  if (path.includes("/rides") && method === "POST") {
    return { id: path.split("/")[3], status: "CANCELLED" } as T;
  }
  if (path.includes("/rides")) {
    return [
      {
        id: "r1",
        passengerId: "1",
        driverId: "2",
        status: "COMPLETED",
        vehicleType: "STANDARD",
        pickupAddress: "Gombe",
        dropoffAddress: "Limete",
        priceCdf: 8500,
        createdAt: new Date().toISOString(),
      },
      {
        id: "r2",
        passengerId: "1",
        status: "SEARCHING",
        vehicleType: "MOTO_TAXI",
        pickupAddress: "Bandal",
        dropoffAddress: "Kintambo",
        priceCdf: 3500,
        createdAt: new Date().toISOString(),
      },
    ] as T;
  }
  if (path.match(/\/deliveries\/[^/?]+/) && method === "GET") {
    return {
      id: "del-1",
      type: "PARCEL",
      status: "IN_TRANSIT",
      pickupAddress: "Gombe",
      dropoffAddress: "Ngaliema",
      priceCdf: 5000,
      events: [{ event: "PENDING", createdAt: new Date().toISOString() }],
    } as T;
  }
  if (path.includes("/deliveries") && method === "PATCH") {
    return { id: path.split("/")[3], status: body.status } as T;
  }
  if (path.includes("/deliveries")) {
    return [
      { id: "del-1", type: "PARCEL", status: "IN_TRANSIT", pickupAddress: "Gombe", dropoffAddress: "Ngaliema", priceCdf: 5000 },
      { id: "del-2", type: "FOOD", status: "PENDING", restaurantName: "Chez Mama", priceCdf: 12000 },
      { id: "del-3", type: "EXPRESS", status: "DELIVERED", pickupAddress: "Bandal", dropoffAddress: "Kintambo", priceCdf: 4500 },
    ] as T;
  }
  if (path.includes("/scheduled-rides") && method === "POST") {
    return { id: path.split("/")[3], status: "CANCELLED" } as T;
  }
  if (path.includes("/scheduled-rides")) {
    return [
      {
        id: "sch-1",
        passengerId: "1",
        pickupAddress: "Gombe",
        dropoffAddress: "Aéroport N'djili",
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        status: "SCHEDULED",
        priceCdf: 25000,
      },
    ] as T;
  }
  if (path.includes("/restaurants") && method !== "GET") {
    return { id: "rest-1", name: body.name ?? "Nouveau restaurant", isActive: true, ...body } as T;
  }
  if (path.includes("/restaurants")) {
    return [
      {
        id: "rest-1",
        name: "Chez Mama",
        cuisine: "Congolaise",
        address: "Av. du Commerce, Gombe",
        lat: -4.3217,
        lng: 15.3125,
        rating: 4.5,
        isActive: true,
        menuItems: [{ name: "Poulet moambe", priceCdf: 8000 }],
      },
    ] as T;
  }
  if (path.includes("/delivery-pricing-rules") && method !== "GET") {
    return { category: path.split("/").pop(), ...body } as T;
  }
  if (path.includes("/delivery-pricing-rules")) {
    return [
      { category: "PARCEL", baseFareCdf: 1500, perKmCdf: 600, perMinuteCdf: 80, minFareCdf: 2500, isActive: true },
      { category: "FOOD", baseFareCdf: 1200, perKmCdf: 550, perMinuteCdf: 70, minFareCdf: 2200, isActive: true },
      { category: "EXPRESS", baseFareCdf: 2000, perKmCdf: 750, perMinuteCdf: 100, minFareCdf: 3500, isActive: true },
    ] as T;
  }
  if (path.includes("/subscription-plans") && method === "POST") {
    return {
      id: `plan-${Date.now()}`,
      name: body.name ?? "Nouveau plan",
      priceCdfPerMonth: body.priceCdfPerMonth ?? 0,
      benefits: body.benefits ?? [],
      isActive: true,
      subscriberCount: 0,
    } as T;
  }
  if (path.match(/\/subscription-plans\/[^/?]+/) && method === "PATCH") {
    return { id: path.split("/").pop(), ...body } as T;
  }
  if (path.includes("/subscription-plans")) {
    return [
      {
        id: "plan-basic",
        name: "MOVA Basic",
        priceCdfPerMonth: 5000,
        benefits: ["5 % de réduction courses", "Support prioritaire"],
        isActive: true,
        subscriberCount: 128,
      },
      {
        id: "plan-plus",
        name: "MOVA Plus",
        priceCdfPerMonth: 12000,
        benefits: ["10 % réduction", "Livraisons offertes (2/mois)", "Annulation gratuite"],
        isActive: true,
        subscriberCount: 42,
      },
      {
        id: "plan-pro",
        name: "MOVA Pro",
        priceCdfPerMonth: 25000,
        benefits: ["15 % réduction", "Livraisons illimitées", "Chauffeur VIP"],
        isActive: false,
        subscriberCount: 7,
      },
    ] as T;
  }
  if (path.includes("/subscriptions")) {
    return [
      { id: "sub-1", userId: "1", planId: "plan-basic", planName: "MOVA Basic", status: "ACTIVE", startedAt: new Date().toISOString() },
      { id: "sub-2", userId: "2", planId: "plan-plus", planName: "MOVA Plus", status: "ACTIVE", startedAt: new Date().toISOString() },
    ] as T;
  }
  if (path.includes("/wallet/overview")) {
    return { totalBalanceCdf: 12500000, pendingPayoutsCdf: 890000, transactionsToday: 156 } as T;
  }
  if (path.includes("/users/me")) {
    const role = normalizeAdminRole(roleFromToken()) ?? "ADMIN";
    return {
      id: "1",
      phone: "+243900000001",
      role,
      firstName: "Admin",
      lastName: "MOVA",
    } as T;
  }
  if (path.includes("/pricing-rules") && method !== "GET") {
    return { vehicleType: path.split("/").pop(), ...body } as T;
  }
  if (path.includes("/pricing-rules")) {
    return [
      { vehicleType: "MOTO_TAXI", baseFareCdf: 1000, perKmCdf: 500, perMinuteCdf: 100, minFareCdf: 2000, isActive: true },
      { vehicleType: "STANDARD", baseFareCdf: 2000, perKmCdf: 800, perMinuteCdf: 150, minFareCdf: 3500, isActive: true },
      { vehicleType: "COMFORT", baseFareCdf: 3000, perKmCdf: 1000, perMinuteCdf: 200, minFareCdf: 5000, isActive: true },
      { vehicleType: "VIP", baseFareCdf: 5000, perKmCdf: 1500, perMinuteCdf: 300, minFareCdf: 8000, isActive: true },
    ] as T;
  }
  if (path.includes("/incidents") && method === "POST") {
    return { id: path.split("/")[3], status: "RESOLVED" } as T;
  }
  if (path.includes("/incidents")) {
    return [
      { id: "inc-1", userId: "1", type: "FRAUD", description: "Litige paiement course #r1", status: "OPEN", createdAt: new Date().toISOString() },
      { id: "inc-2", userId: "2", type: "OTHER", description: "Retard chauffeur", status: "RESOLVED", createdAt: new Date().toISOString() },
    ] as T;
  }
  if (path.includes("/geo/communes")) {
    return [
      { id: "c1", name: "Gombe", city: "Kinshasa", lat: -4.3217, lng: 15.3125 },
      { id: "c2", name: "Limete", city: "Kinshasa", lat: -4.331, lng: 15.313 },
      { id: "c3", name: "Bandalungwa", city: "Kinshasa", lat: -4.35, lng: 15.28 },
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
    city: raw.city ?? "Kinshasa",
  };
}

export function formatUserName(u: AdminUser) {
  if (u.name) return u.name;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return full || u.phone || u.id;
}

export function formatCdf(amount?: number) {
  return `${(amount ?? 0).toLocaleString("fr-CD")} FC`;
}

export function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-CD");
}

export async function fetchCommunes(city = "Kinshasa"): Promise<Commune[]> {
  const q = encodeURIComponent(city);
  return apiFetch<Commune[]>(`/api/geo/communes?city=${q}`);
}

export async function updateUser(id: string, data: Partial<AdminUser>) {
  return apiFetch<AdminUser>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function setDriverStatus(userId: string, active: boolean, suspendUser?: boolean) {
  return apiFetch(`/api/admin/drivers/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ active, suspendUser }),
  });
}

export async function cancelRide(id: string, reason?: string) {
  return apiFetch(`/api/admin/rides/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function cancelScheduledRide(id: string, reason?: string) {
  return apiFetch(`/api/admin/scheduled-rides/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function updateDeliveryStatus(id: string, status: string) {
  return apiFetch(`/api/admin/deliveries/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function saveRestaurant(data: Partial<Restaurant>, id?: string) {
  if (id) {
    return apiFetch<Restaurant>(`/api/admin/restaurants/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }
  return apiFetch<Restaurant>("/api/admin/restaurants", { method: "POST", body: JSON.stringify(data) });
}

export async function fetchCurrentUser(): Promise<AdminSessionUser> {
  return apiFetch<AdminSessionUser>("/api/users/me");
}

export async function fetchPricingRules(): Promise<PricingRule[]> {
  return apiFetch<PricingRule[]>("/api/admin/pricing-rules");
}

export async function updatePricingRule(vehicleType: string, data: Partial<PricingRule>) {
  return apiFetch<PricingRule>(`/api/admin/pricing-rules/${vehicleType}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createPricingRule(vehicleType: string, data: Partial<PricingRule>) {
  return apiFetch<PricingRule>(`/api/admin/pricing-rules/${vehicleType}`, { method: "POST", body: JSON.stringify(data) });
}

export async function fetchDeliveryPricingRules(): Promise<DeliveryPricingRule[]> {
  return apiFetch<DeliveryPricingRule[]>("/api/admin/delivery-pricing-rules");
}

export async function updateDeliveryPricingRule(category: string, data: Partial<DeliveryPricingRule>) {
  return apiFetch<DeliveryPricingRule>(`/api/admin/delivery-pricing-rules/${category}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  return apiFetch<SubscriptionPlan[]>("/api/admin/subscription-plans");
}

export async function createSubscriptionPlan(data: Partial<SubscriptionPlan>) {
  return apiFetch<SubscriptionPlan>("/api/admin/subscription-plans", { method: "POST", body: JSON.stringify(data) });
}

export async function updateSubscriptionPlan(id: string, data: Partial<SubscriptionPlan>) {
  return apiFetch<SubscriptionPlan>(`/api/admin/subscription-plans/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function fetchSubscriptions(): Promise<SubscriptionRecord[]> {
  return apiFetch<SubscriptionRecord[]>("/api/admin/subscriptions");
}

export async function fetchWalletOverview(): Promise<WalletOverview> {
  return apiFetch<WalletOverview>("/api/admin/wallet/overview");
}

export function assertAdminRole(role?: string | null): role is AdminRole {
  return isAdminRole(role);
}
