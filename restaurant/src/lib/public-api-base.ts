/**
 * Browser `NEXT_PUBLIC_API_URL` must be the gateway origin (no `/api` suffix).
 * Clients append `/api/...`; a trailing `/api` caused `/api/api/...` 404s in prod.
 */
export function normalizePublicApiBaseUrl(
  raw?: string | null,
  fallback = "http://localhost:3000",
): string {
  const base = (raw ?? fallback).trim().replace(/\/+$/, "");
  return base.replace(/\/api$/i, "") || fallback;
}

export const PUBLIC_API_BASE = normalizePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
