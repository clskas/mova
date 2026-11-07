import { AsyncLocalStorage } from 'async_hooks';
import { SERVER_STRINGS_EN } from './server-strings-en';

/** Languages the apps offer. Lingala and Swahili come after a native review. */
export type AppLanguage = 'fr' | 'en';

/** Header the mobile app sends with every request (the app's chosen language). */
export const APP_LANGUAGE_HEADER = 'x-app-language';

/** Reads 'en' from x-app-language or Accept-Language; anything else is French. */
export function normalizeAppLanguage(value: unknown): AppLanguage {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return 'fr';
  const first = raw.split(',')[0]?.trim().toLowerCase() ?? '';
  return first === 'en' || first.startsWith('en-') ? 'en' : 'fr';
}

/**
 * Language chosen in the SENGA app (x-app-language). Accept-Language is ignored on purpose:
 * an English browser must not turn the French web portals half English.
 */
export function languageFromHeaders(headers: Record<string, unknown> | undefined): AppLanguage {
  if (!headers) return 'fr';
  return normalizeAppLanguage(headers[APP_LANGUAGE_HEADER]);
}

type Template = { re: RegExp; en: string; order: number[] };

const exact = new Map<string, string>();
const templates: Template[] = [];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const [fr, en] of SERVER_STRINGS_EN) {
  if (!/\{\d+\}/.test(fr)) {
    exact.set(fr, en);
    continue;
  }
  const order: number[] = [];
  const pattern = fr
    .split(/(\{\d+\})/)
    .map((part) => {
      const m = /^\{(\d+)\}$/.exec(part);
      if (m) {
        order.push(Number(m[1]));
        return '([\\s\\S]*?)';
      }
      return escapeRe(part);
    })
    .join('');
  templates.push({ re: new RegExp(`^${pattern}$`), en, order });
}
// Longest (most specific) templates first.
templates.sort((a, b) => b.re.source.length - a.re.source.length);

/**
 * Translates a French text written by the server into the app language.
 * Unknown texts are returned unchanged, so nothing breaks when a translation is missing.
 */
export function translateServerText(text: string, lang: AppLanguage): string {
  if (lang !== 'en' || !text) return text;
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  const trimmed = text.trim();
  if (trimmed !== text) {
    const t = exact.get(trimmed);
    if (t !== undefined) return text.replace(trimmed, t);
  }
  if (text.length > 2000) return text;
  for (const t of templates) {
    const m = t.re.exec(text);
    if (!m) continue;
    const values: Record<number, string> = {};
    t.order.forEach((idx, i) => {
      // A placeholder value may itself be a known text (a status, a label).
      values[idx] = translateServerText(m[i + 1] ?? '', lang);
    });
    return t.en.replace(/\{(\d+)\}/g, (_, n: string) => values[Number(n)] ?? '');
  }
  return text;
}

/** JSON keys whose string values are UI text the server wrote (never ids, codes or user input). */
export const TRANSLATABLE_KEYS = new Set([
  'message',
  'error',
  'statusLabel',
  'label',
  'title',
  'subtitle',
  'body',
  'hint',
  'notice',
  'warning',
  'detail',
  'helperText',
  'typeLabel',
  'kindLabel',
  'categoryLabel',
  'paymentLabel',
  'serviceLabel',
  'stepLabel',
  'reasonLabel',
  'summary',
  'tip',
  'cta',
  'bannerMessage',
  'displayStatus',
  'remainingLabel',
  'reply',
]);

/**
 * Translates a JSON response for an English-speaking user:
 * - string values of [TRANSLATABLE_KEYS] (and string arrays under them),
 * - partner content: an object carrying `translations.en` gets those fields
 *   (AI-translated menu items, listings, ads) in place of the French ones.
 */
export function translateResponseBody(value: unknown, lang: AppLanguage, depth = 0): unknown {
  if (lang !== 'en' || depth > 12 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => translateResponseBody(v, lang, depth + 1));
  if (typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && TRANSLATABLE_KEYS.has(k)) out[k] = translateServerText(v, lang);
    else if (Array.isArray(v) && TRANSLATABLE_KEYS.has(k) && v.every((x) => typeof x === 'string'))
      out[k] = (v as string[]).map((x) => translateServerText(x, lang));
    else out[k] = translateResponseBody(v, lang, depth + 1);
  }
  const tr = obj.translations as Record<string, unknown> | undefined;
  const en = tr && typeof tr === 'object' ? (tr.en as Record<string, unknown> | undefined) : undefined;
  if (en && typeof en === 'object') {
    for (const [k, v] of Object.entries(en)) {
      if (typeof v === 'string' && v.trim() && typeof obj[k] === 'string') out[k] = v;
    }
  }
  return out;
}

const requestLanguage = new AsyncLocalStorage<AppLanguage>();

/**
 * Express middleware: remembers the caller's app language for the whole request,
 * so texts built deep in a service (OTP SMS, withdrawal code) can follow it.
 */
export function appLanguageMiddleware(
  req: { headers: Record<string, unknown> },
  _res: unknown,
  next: () => void,
): void {
  requestLanguage.run(languageFromHeaders(req.headers), next);
}

/** Language of the request being handled ('fr' outside a request). */
export function currentRequestLanguage(): AppLanguage {
  return requestLanguage.getStore() ?? 'fr';
}

/** Runs [fn] as if the request language were [lang] (tests, background jobs). */
export function runWithLanguage<T>(lang: AppLanguage, fn: () => T): T {
  return requestLanguage.run(lang, fn);
}
