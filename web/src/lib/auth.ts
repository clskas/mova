const TOKEN_KEY = 'mova_web_token';
const PHONE_KEY = 'mova_web_phone';
const PIN_PENDING_KEY = 'mova_web_pin_pending';

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
