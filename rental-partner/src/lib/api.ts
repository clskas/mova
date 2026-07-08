import { authHeaders } from "./auth";
import { sanitizeUserMessage } from "./user-messages";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export type PartnerProfile = {
  userId: string;
  name?: string;
  phone?: string;
  vehicleCounts?: { pending?: number; approved?: number; rejected?: number };
  pendingBookings?: number;
};

export type PartnerBooking = {
  id: string;
  status: string;
  statusLabel?: string;
  vehicleName?: string;
  vehicleId?: string | null;
  passengerName?: string;
  passengerPhone?: string;
  pickupCity?: string | null;
  returnCity?: string | null;
  pickupAddress?: string | null;
  startDate?: string;
  endDate?: string;
  rentalPeriod?: string;
  priceCdf?: number | null;
  displayAmountCdf?: number | null;
  displayAmountLabel?: string;
  ownerNetCdf?: number | null;
  notes?: string | null;
  createdAt?: string;
  driverId?: string | null;
  movaDriverId?: string | null;
  logisticsMode?: string;
  logisticsModeLabel?: string;
  needsMovaLogistics?: boolean;
  passengerDriverName?: string | null;
  passengerDriverPhone?: string | null;
  ownerDriverName?: string | null;
  ownerDriverPhone?: string | null;
  nextStepHint?: string | null;
  remainingLabel?: string | null;
  paymentReady?: boolean;
  canConfirmCash?: boolean;
  isPaid?: boolean;
};

export type PartnerVehicle = {
  id: string;
  name: string;
  make?: string;
  model?: string;
  category: string;
  categoryLabel?: string;
  city?: string;
  dailyRateCdf: number;
  hourlyRateCdf?: number | null;
  depositCdf?: number;
  seats?: number;
  transmission?: string;
  ownerName?: string;
  ownerContactPhone?: string;
  features?: string[];
  imageUrl?: string | null;
  isActive?: boolean;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  approvalStatusLabel?: string;
  createdAt?: string;
};

function extractErrorMessage(data: Record<string, unknown>, status: number): string {
  const err = data?.error;
  if (err && typeof err === "object" && err !== null && "message" in err) {
    const raw = (err as { message?: unknown }).message;
    if (Array.isArray(raw)) return sanitizeUserMessage(raw.join(", "));
    return sanitizeUserMessage(raw);
  }
  return sanitizeUserMessage(data?.message ?? `Erreur ${status}`);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(extractErrorMessage(data, res.status));
  }
  return data as T;
}

export function formatCdf(amount?: number) {
  if (amount == null) return "—";
  return `${amount.toLocaleString("fr-CD")} FC`;
}

export function mediaUrl(path?: string | null): string | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `${API_BASE}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function fetchProfile() {
  return apiFetch<PartnerProfile>("/api/rental-partner/profile");
}

export function fetchVehicles() {
  return apiFetch<PartnerVehicle[]>("/api/rental-partner/vehicles");
}

export function fetchVehicle(id: string) {
  return apiFetch<PartnerVehicle>(`/api/rental-partner/vehicles/${id}`);
}

export function submitVehicle(data: Record<string, unknown>) {
  return apiFetch<PartnerVehicle>("/api/rental-partner/vehicles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateVehicle(id: string, data: Record<string, unknown>) {
  return apiFetch<PartnerVehicle>(`/api/rental-partner/vehicles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteVehicle(id: string) {
  return apiFetch<{ id: string; isActive: boolean; message?: string }>(`/api/rental-partner/vehicles/${id}`, {
    method: "DELETE",
  });
}

export async function uploadVehiclePhoto(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(bytes);
  const mimeType = file.type || "image/jpeg";
  const result = await apiFetch<{ photoUrl?: string }>("/api/rental-partner/vehicle-photo", {
    method: "POST",
    body: JSON.stringify({ imageBase64: base64, mimeType }),
  });
  if (!result.photoUrl) throw new Error("Impossible d'enregistrer la photo.");
  return result.photoUrl;
}

export function fetchBookings() {
  return apiFetch<{ data: PartnerBooking[] }>("/api/rental-partner/bookings");
}

export function fetchBooking(id: string) {
  return apiFetch<PartnerBooking>(`/api/rental-partner/bookings/${id}`);
}

export function updateBookingStatus(id: string, action: "acknowledge" | "confirm" | "decline" | "start" | "return") {
  return apiFetch<PartnerBooking>(`/api/rental-partner/bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
}

export function confirmBookingCash(id: string, pin: string) {
  return apiFetch<PartnerBooking>(`/api/rental-partner/bookings/${id}/cash/confirm`, {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export function updateBookingLogistics(
  id: string,
  data: { logisticsMode: "SELF_PASSENGER" | "OWNER_DRIVER"; ownerDriverName?: string; ownerDriverPhone?: string },
) {
  return apiFetch<PartnerBooking>(`/api/rental-partner/bookings/${id}/logistics`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  return apiFetch<{ promos: PartnerPromo[] }>("/api/rental-partner/promos");
}

export function createPromo(data: {
  code: string;
  discountPercent?: number;
  discountCdf?: number;
  maxUses?: number;
  validUntil?: string;
  absorbedBy?: string;
  partnerAbsorbPercent?: number;
}) {
  return apiFetch<PartnerPromo>("/api/rental-partner/promos", { method: "POST", body: JSON.stringify(data) });
}

export function updatePromo(id: string, data: Partial<{ isActive: boolean; maxUses: number; validUntil: string }>) {
  return apiFetch<PartnerPromo>(`/api/rental-partner/promos/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function downloadBookingReceiptPdf(bookingId: string) {
  const res = await fetch(`${API_BASE}/api/rental-partner/bookings/${bookingId}/receipt/pdf`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(extractErrorMessage(data, res.status));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mova-booking-${bookingId.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export type ChatMessagePayload = {
  id?: string;
  text?: string;
  senderRole?: string;
  ts?: number;
};

export function fetchRentalChat(inquiryId: string) {
  return apiFetch<{ inquiryId?: string; messages: ChatMessagePayload[] }>(`/api/rental/inquiries/${inquiryId}/chat`);
}

export function sendRentalChat(inquiryId: string, text: string) {
  return apiFetch<ChatMessagePayload>(`/api/rental/inquiries/${inquiryId}/chat`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
