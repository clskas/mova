const TOKEN_KEY = "mova_restaurant_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob !== "undefined" ? atob(base64) : Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function roleFromToken(): string | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const role = payload?.role;
  return typeof role === "string" ? role : null;
}

export function isRestaurantRole(role: string | null): boolean {
  return role === "RESTAURANT";
}

/** Seed demo range +2439000000xx — OTP 123456, no SMS. */
const SEED_DEMO_PHONE_RE = /^\+2439000000\d{2}$/;

export function normalizeLoginPhone(phone: string): string {
  let n = (phone ?? "").replace(/[\s\-.\(\)\u00a0]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (n.startsWith("+2430") && n.length === 14) n = `+243${n.slice(5)}`;
  if (n.startsWith("2430") && n.length === 13) n = `243${n.slice(4)}`;
  if (n.startsWith("0") && n.length === 10) return `+243${n.slice(1)}`;
  if (n.startsWith("243") && n.length === 12) return `+${n}`;
  if (/^[89]\d{8}$/.test(n)) return `+243${n}`;
  return n;
}

export function isSeedDemoPhone(phone: string): boolean {
  return SEED_DEMO_PHONE_RE.test(normalizeLoginPhone(phone));
}

export function phoneFromToken(): string | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  return typeof payload?.phone === "string" ? payload.phone : null;
}
