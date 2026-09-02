const TOKEN_KEY = "mova_rental_partner_token";
const PIN_PENDING_KEY = "mova_rental_partner_pin_pending";
const LAST_PHONE_KEY = "mova_rental_partner_last_phone";
const PIN_UNLOCK_KEY = "mova_rental_partner_pin_unlocked";

function storageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Safari private mode / blocked storage */
  }
}

function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getToken(): string | null {
  return storageGet(TOKEN_KEY);
}

export function setToken(token: string, phone?: string) {
  storageSet(TOKEN_KEY, token);
  if (phone) storageSet(LAST_PHONE_KEY, phone);
}

export function clearToken() {
  storageRemove(TOKEN_KEY);
  storageRemove(PIN_PENDING_KEY);
  clearPinSessionUnlocked();
}

export function dropTokenKeepPhone(phone?: string): void {
  storageRemove(TOKEN_KEY);
  storageRemove(PIN_PENDING_KEY);
  const keep = (phone || getLastPhone() || "").trim();
  if (keep) storageSet(LAST_PHONE_KEY, keep);
}

export function markPinSessionUnlocked(): void {
  try {
    sessionStorage.setItem(PIN_UNLOCK_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isPinSessionUnlocked(): boolean {
  try {
    return sessionStorage.getItem(PIN_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPinSessionUnlocked(): void {
  try {
    sessionStorage.removeItem(PIN_UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}

export function setPinPending(pending: boolean): void {
  if (pending) storageSet(PIN_PENDING_KEY, "1");
  else storageRemove(PIN_PENDING_KEY);
}

export function isPinPending(): boolean {
  return storageGet(PIN_PENDING_KEY) === "1";
}

export function getLastPhone(): string | null {
  return storageGet(LAST_PHONE_KEY);
}

export function setLastPhone(phone: string): void {
  const trimmed = phone.trim();
  if (trimmed) storageSet(LAST_PHONE_KEY, trimmed);
}

export function clearLastPhone(): void {
  storageRemove(LAST_PHONE_KEY);
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

export function isRentalPartnerRole(role: string | null): boolean {
  return role === "RENTAL_PARTNER" || role === "SUPER_ADMIN";
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
  const phone = typeof payload?.phone === "string" ? payload.phone.trim() : "";
  if (phone) return phone;
  const email = typeof payload?.email === "string" ? payload.email.trim() : "";
  return email || null;
}
