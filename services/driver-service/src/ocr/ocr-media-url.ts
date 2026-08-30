const OCR_ALLOWED_HOSTS = new Set(['cdn.mova.cd', 'api.afri-soft.com', 'senga.afri-soft.com']);

export function isAllowedOcrMediaHostname(hostname: string, extraHosts: Iterable<string> = []): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (OCR_ALLOWED_HOSTS.has(host)) return true;
  if (host === 'supabase.co' || host.endsWith('.supabase.co')) return true;
  for (const extra of extraHosts) {
    if (extra && extra.toLowerCase() === host) return true;
  }
  return false;
}

export function parseAllowedOcrMediaUrl(absolute: string, extraHosts: Iterable<string> = []): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!isAllowedOcrMediaHostname(parsed.hostname, extraHosts)) return null;
  return parsed;
}

export function hostnameFromUrl(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.trim()).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}
