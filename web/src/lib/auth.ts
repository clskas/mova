const TOKEN_KEY = 'mova_web_token';
const PHONE_KEY = 'mova_web_phone';
const PIN_PENDING_KEY = 'mova_web_pin_pending';
const PIN_UNLOCK_KEY = 'mova_web_pin_unlocked';

function storageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
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

export function setToken(token: string, phone?: string): void {
  storageSet(TOKEN_KEY, token);
  if (phone) storageSet(PHONE_KEY, phone);
}

export function clearToken(): void {
  storageRemove(TOKEN_KEY);
  storageRemove(PHONE_KEY);
  storageRemove(PIN_PENDING_KEY);
  clearPinSessionUnlocked();
}

export function dropTokenKeepPhone(phone?: string): void {
  storageRemove(TOKEN_KEY);
  storageRemove(PIN_PENDING_KEY);
  const keep = (phone || getStoredPhone() || "").trim();
  if (keep) storageSet(PHONE_KEY, keep);
}

export function markPinSessionUnlocked(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PIN_UNLOCK_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isPinSessionUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(PIN_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPinSessionUnlocked(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PIN_UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}

export function setPinPending(pending: boolean): void {
  if (pending) storageSet(PIN_PENDING_KEY, '1');
  else storageRemove(PIN_PENDING_KEY);
}

export function isPinPending(): boolean {
  return storageGet(PIN_PENDING_KEY) === '1';
}

export function getStoredPhone(): string | null {
  return storageGet(PHONE_KEY);
}

export function phoneFromToken(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob !== "undefined" ? atob(base64) : Buffer.from(base64, "base64").toString("utf8");
    const payload = JSON.parse(json) as { phone?: unknown };
    return typeof payload.phone === "string" ? payload.phone : null;
  } catch {
    return null;
  }
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

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
