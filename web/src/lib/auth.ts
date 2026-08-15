const TOKEN_KEY = 'mova_web_token';
const PHONE_KEY = 'mova_web_phone';

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
}

export function getStoredPhone(): string | null {
  return storageGet(PHONE_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
