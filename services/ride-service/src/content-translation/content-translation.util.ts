import { createHash } from 'crypto';

/** Fields that hold text written by partners (menus, listings, ads, service catalogue). */
const ALWAYS_KEYS = new Set(['description', 'cuisine', 'promotionLabel', 'titre', 'categoryName', 'subtitle', 'tagline']);
/** `name` / `label` are content only next to these (a dish, a size, a category, a vehicle, a store). */
const CONTENT_SIBLINGS = ['unitPriceCdf', 'priceCdf', 'dailyRateCdf', 'sortOrder', 'cuisine', 'isAvailable', 'stockQty', 'options', 'sizes', 'group'];
/** Objects describing a person are never sent for translation. */
const PERSON_KEYS = ['phone', 'phoneNumber', 'firstName', 'lastName', 'email'];

export const MAX_CONTENT_TEXT = 1500;

export function sourceKey(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex');
}

function isTranslatable(text: string): boolean {
  const t = text.trim();
  return t.length >= 2 && t.length <= MAX_CONTENT_TEXT && /[A-Za-zÀ-ÿ]{2}/.test(t) && !/^https?:\/\//i.test(t);
}

function contentKeysOf(obj: Record<string, unknown>): string[] {
  if (PERSON_KEYS.some((k) => k in obj)) return [];
  const keys = Object.keys(obj).filter((k) => ALWAYS_KEYS.has(k));
  if (CONTENT_SIBLINGS.some((k) => k in obj)) {
    if ('name' in obj) keys.push('name');
    if ('label' in obj) keys.push('label');
  }
  return keys;
}

/** Every partner text in a response body (deduplicated). */
export function collectContentTexts(value: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 14 || value == null) return out;
  if (Array.isArray(value)) {
    for (const v of value) collectContentTexts(v, out, depth + 1);
    return out;
  }
  if (typeof value !== 'object') return out;
  const obj = value as Record<string, unknown>;
  for (const k of contentKeysOf(obj)) {
    const v = obj[k];
    if (typeof v === 'string' && isTranslatable(v)) out.add(v);
  }
  for (const v of Object.values(obj)) collectContentTexts(v, out, depth + 1);
  return out;
}

/** Same body with partner texts replaced by their English version when one is known. */
export function applyContentTranslations(value: unknown, dict: Map<string, string>, depth = 0): unknown {
  if (depth > 14 || value == null || dict.size === 0) return value;
  if (Array.isArray(value)) return value.map((v) => applyContentTranslations(v, dict, depth + 1));
  if (typeof value !== 'object' || value instanceof Date) return value;
  const obj = value as Record<string, unknown>;
  const keys = new Set(contentKeysOf(obj));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keys.has(k) && typeof v === 'string') out[k] = dict.get(v) ?? v;
    else out[k] = applyContentTranslations(v, dict, depth + 1);
  }
  return out;
}

/** GET routes that return partner content to passengers and drivers. */
export function isContentRoute(method: string, path: string): boolean {
  if (method !== 'GET') return false;
  const p = path.replace(/^\/api/, '').split('?')[0];
  if (/\/chat(\/|$)/.test(p)) return false;
  return /^\/(deliveries|rental|publicites|services|errands|history)(\/|$)/.test(p);
}
