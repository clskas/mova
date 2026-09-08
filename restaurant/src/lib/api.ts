import { authHeaders } from "./auth";
import { PUBLIC_API_BASE } from "./public-api-base";
import { httpStatusUserMessage, sanitizeUserMessage } from "./user-messages";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function extractErrorMessage(data: Record<string, unknown>, status: number): string {
  const err = data?.error;
  let raw: unknown;
  if (err && typeof err === "object" && err !== null && "message" in err) {
    raw = (err as { message?: unknown }).message;
  } else if (typeof err === "string") {
    raw = err;
  } else {
    raw = data?.message;
  }
  if (Array.isArray(raw)) raw = raw.filter(Boolean).join(". ");
  return sanitizeUserMessage(raw ?? `Erreur ${status}`, httpStatusUserMessage(status));
}

const API_BASE = PUBLIC_API_BASE;

export function getApiBase() {
  return API_BASE;
}

export type MenuItem = {
  name: string;
  unitPriceCdf: number;
  imageUrl?: string;
  description?: string;
  isAvailable?: boolean;
};

export type RestaurantProfile = {
  id: string;
  name: string;
  cuisine?: string;
  address?: string;
  lat?: number;
  lng?: number;
  isAcceptingOrders?: boolean;
  prepTimeMin?: number;
  menuItems?: MenuItem[];
  courierMode?: "PLATFORM" | "OWN" | "HYBRID";
  kycStatus?: string;
  canOperate?: boolean;
};

export type CourierMode = "PLATFORM" | "OWN" | "HYBRID";

export type RestaurantFleetDriver = {
  id: string;
  driverUserId: string;
  isActive: boolean;
  phone?: string;
  name?: string;
};

export type RestaurantOrder = {
  id: string;
  status: string;
  statusLabel?: string;
  items?: unknown;
  deliveryAddress?: string;
  estimatedPriceCdf?: number;
  itemsSubtotalCdf?: number;
  partnerNetCdf?: number;
  partnerDiscountCdf?: number;
  promoCode?: string | null;
  createdAt?: string;
  driverAssigned?: boolean;
  isPaid?: boolean;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paymentStatusLabel?: string | null;
  guaranteed?: boolean;
  escrowReady?: boolean;
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error("Réseau indisponible. Vérifiez votre connexion.");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(extractErrorMessage(data, res.status), res.status);
  }
  return data as T;
}

export function formatCdf(amount?: number) {
  if (amount == null) return "—";
  return `${amount.toLocaleString("fr-CD")} FC`;
}

/** URL absolue pour afficher une photo API (/api/uploads/...) */
export function mediaUrl(path?: string | null): string | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `${API_BASE}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

export function fetchProfile() {
  return apiFetch<RestaurantProfile>("/api/restaurant/profile");
}

export function fetchMenu() {
  return apiFetch<{ restaurantId: string; menuItems: MenuItem[] }>("/api/restaurant/menu");
}

export function fetchOrders(params?: {
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  skip?: number;
  take?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  if (params?.q) sp.set("q", params.q);
  if (params?.skip != null) sp.set("skip", String(params.skip));
  if (params?.take != null) sp.set("take", String(params.take));
  const q = sp.toString() ? `?${sp.toString()}` : "";
  return apiFetch<{
    restaurant: { id: string; name: string };
    orders: RestaurantOrder[];
    pagination?: { skip: number; take: number; total: number };
  }>(`/api/restaurant/orders${q}`);
}

export type RestaurantDashboard = {
  restaurant: { id: string; name: string; isAcceptingOrders?: boolean; prepTimeMin?: number };
  kpis: {
    pendingOrders: number;
    activeOrders: number;
    deliveredTodayCount: number;
    deliveredTodayGrossCdf: number;
    balanceCdf: number;
    formattedBalance: string;
    walletAvailable?: boolean;
    walletMessage?: string;
    revenueTodayCdf: number;
    revenueMonthCdf: number;
    totalSalesCount: number;
  };
  recentOrders: RestaurantOrder[];
};

export function fetchDashboard() {
  return apiFetch<RestaurantDashboard>("/api/restaurant/dashboard");
}

export type RestaurantEarnings = {
  restaurant: { id: string; name: string };
  balanceCdf: number;
  formattedBalance: string;
  walletAvailable?: boolean;
  walletMessage?: string;
  recentFoodSales: {
    id: string;
    amountCdf: number;
    description?: string;
    reference?: string;
    createdAt: string;
  }[];
};

export function fetchEarnings() {
  return apiFetch<RestaurantEarnings>("/api/restaurant/earnings");
}

export type WalletWithdrawResult = {
  success?: boolean;
  message?: string;
  balanceCdf?: number;
  formattedBalance?: string;
};

export function requestWithdrawOtp(data: { amountCdf: number; provider: string; phone: string }) {
  return apiFetch<WalletWithdrawResult>("/api/wallet/withdraw/otp", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function withdrawPartnerWallet(data: {
  amountCdf: number;
  provider: string;
  phone: string;
  otp: string;
}) {
  return apiFetch<WalletWithdrawResult>("/api/wallet/withdraw", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function topUpPartnerWallet(data: { amountCdf: number; provider: string; phone: string }) {
  return apiFetch<WalletWithdrawResult>("/api/wallet/top-up", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function fetchEarningsReport(params?: { from?: string; to?: string; q?: string; skip?: number; take?: number }) {
  const sp = new URLSearchParams();
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  if (params?.q) sp.set("q", params.q);
  if (params?.skip != null) sp.set("skip", String(params.skip));
  if (params?.take != null) sp.set("take", String(params.take));
  const q = sp.toString() ? `?${sp.toString()}` : "";
  return apiFetch<import("./partner-reports").PartnerEarningsReport>(`/api/restaurant/earnings/report${q}`);
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

export function fetchRestaurantDrivers() {
  return apiFetch<{
    restaurantId: string;
    courierMode: "PLATFORM" | "OWN" | "HYBRID";
    drivers: RestaurantFleetDriver[];
  }>("/api/restaurant/drivers");
}

export function addRestaurantDriver(data: { driverUserId?: string; phone?: string }) {
  return apiFetch<RestaurantFleetDriver>("/api/restaurant/drivers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function removeRestaurantDriver(driverUserId: string) {
  return apiFetch<{ removed: boolean }>(`/api/restaurant/drivers/${driverUserId}/remove`, {
    method: "POST",
  });
}

export function updateCourierMode(courierMode: "PLATFORM" | "OWN" | "HYBRID") {
  return apiFetch<{ id: string; courierMode: string }>("/api/restaurant/courier-mode", {
    method: "PATCH",
    body: JSON.stringify({ courierMode }),
  });
}

export function assignOwnDriver(orderId: string, driverUserId: string) {
  return apiFetch(`/api/restaurant/orders/${orderId}/assign-driver`, {
    method: "POST",
    body: JSON.stringify({ driverUserId }),
  });
}

export function saveMenu(menuItems: MenuItem[]) {
  return apiFetch<{ menuItems: MenuItem[] }>("/api/restaurant/menu", {
    method: "PATCH",
    body: JSON.stringify({ menuItems }),
  });
}

export function updateMenuSettings(data: {
  isAcceptingOrders?: boolean;
  prepTimeMin?: number;
  promotionLabel?: string;
}) {
  return apiFetch("/api/restaurant/menu", { method: "PATCH", body: JSON.stringify(data) });
}

export function updateRestaurantLocation(data: {
  name?: string;
  cuisine?: string;
  address?: string;
  lat?: number;
  lng?: number;
}) {
  return apiFetch("/api/restaurant/location", { method: "PATCH", body: JSON.stringify(data) });
}

export async function uploadMenuPhoto(file: File): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Lecture fichier impossible"));
    reader.readAsDataURL(file);
  });
  const result = await apiFetch<{ photoUrl: string }>("/api/restaurant/menu-photo", {
    method: "POST",
    body: JSON.stringify({ imageBase64: base64, mimeType: file.type || "image/jpeg" }),
  });
  return result.photoUrl;
}

export type KycChecklistItem = {
  type: string;
  label: string;
  required: boolean;
  uploaded: boolean;
  status?: string | null;
  notes?: string | null;
  url?: string | null;
  documentId?: string | null;
};

export type RestaurantKycDossier = {
  kycStatus?: string;
  kycNotes?: string | null;
  nif?: string | null;
  rccm?: string | null;
  payoutProvider?: string | null;
  payoutPhone?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  canOperate?: boolean;
  pinConfigured?: boolean;
  requiredComplete?: boolean;
  checklist?: KycChecklistItem[];
};

export function fetchKyc() {
  return apiFetch<RestaurantKycDossier>("/api/restaurant/kyc");
}

export function updateKycProfile(data: {
  nif?: string;
  rccm?: string;
  payoutProvider?: string;
  payoutPhone?: string;
}) {
  return apiFetch<RestaurantKycDossier>("/api/restaurant/kyc", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function uploadKycDocument(type: string, file: File) {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Lecture fichier impossible"));
    reader.readAsDataURL(file);
  });
  return apiFetch<RestaurantKycDossier>("/api/restaurant/kyc/document", {
    method: "POST",
    body: JSON.stringify({ type, imageBase64: base64, mimeType: file.type || "image/jpeg" }),
  });
}

export type PartnerPromo = {
  id: string;
  code: string;
  discountPercent?: number | null;
  discountCdf?: number | null;
  maxUses?: number | null;
  usedCount?: number;
  validUntil?: string | null;
  isActive?: boolean;
  scope?: string;
  absorbedBy?: string;
  partnerAbsorbPercent?: number | null;
};

export function fetchPromos() {
  return apiFetch<{ restaurant?: { id: string; name: string }; promos: PartnerPromo[] }>("/api/restaurant/promos");
}

export function createPromo(data: {
  code: string;
  discountPercent?: number;
  discountCdf?: number;
  maxUses?: number;
  validUntil?: string;
  scope?: string;
  absorbedBy?: string;
  partnerAbsorbPercent?: number;
}) {
  return apiFetch<PartnerPromo>("/api/restaurant/promos", { method: "POST", body: JSON.stringify(data) });
}

export function updatePromo(id: string, data: Partial<{ isActive: boolean; maxUses: number; validUntil: string }>) {
  return apiFetch<PartnerPromo>(`/api/restaurant/promos/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function downloadOrderReceiptPdf(orderId: string) {
  const res = await fetch(`${API_BASE}/api/restaurant/orders/${orderId}/receipt/pdf`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? data?.message ?? `Erreur ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mova-order-${orderId.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export type ChatMessagePayload = {
  id?: string;
  text?: string;
  senderRole?: string;
  ts?: number;
};

export function fetchDeliveryChat(deliveryId: string) {
  return apiFetch<{ deliveryId: string; messages: ChatMessagePayload[] }>(`/api/restaurant/orders/${deliveryId}/chat`);
}

export function sendDeliveryChat(deliveryId: string, text: string) {
  return apiFetch<ChatMessagePayload>(`/api/restaurant/orders/${deliveryId}/chat`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function fetchRentalChat(inquiryId: string) {
  return apiFetch<{ inquiryId?: string; messages: ChatMessagePayload[] }>(`/api/rental/inquiries/${inquiryId}/chat`);
}

export function sendRentalChat(inquiryId: string, text: string) {
  return apiFetch<ChatMessagePayload>(`/api/rental/inquiries/${inquiryId}/chat`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export type Publicite = {
  id: string;
  titre: string;
  imageUrl: string;
  lien?: string | null;
  description?: string | null;
};

export type CompanyContact = {
  id?: string;
  name?: string;
  title?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

function parseCompanyContacts(raw: unknown): CompanyContact[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : [];
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? "Contact"),
      title: item.title ? String(item.title) : null,
      department: item.department ? String(item.department) : null,
      phone: item.phone ? String(item.phone) : null,
      email: item.email ? String(item.email) : null,
      notes: item.notes ? String(item.notes) : null,
    }));
}

export async function fetchCompanyContacts(): Promise<CompanyContact[]> {
  try {
    const res = await fetch(`${API_BASE}/api/company-contacts`);
    if (!res.ok) return [];
    return parseCompanyContacts(await res.json());
  } catch {
    return [];
  }
}

export async function fetchActivePublicites(cible?: string): Promise<Publicite[]> {
  const q = cible ? `?cible=${encodeURIComponent(cible)}` : "";
  try {
    const res = await fetch(`${API_BASE}/api/publicites${q}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Publicite[] };
    return Array.isArray(body.data) ? body.data : [];
  } catch {
    return [];
  }
}
