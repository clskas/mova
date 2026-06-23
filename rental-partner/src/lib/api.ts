import { authHeaders } from "./auth";

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
  priceCdf?: number | null;
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

export async function uploadVehiclePhoto(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(bytes);
  const mimeType = file.type || "image/jpeg";
  const result = await apiFetch<{ photoUrl?: string }>("/api/rental-partner/vehicle-photo", {
    method: "POST",
    body: JSON.stringify({ imageBase64: base64, mimeType }),
  });
  if (!result.photoUrl) throw new Error("URL photo manquante");
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
