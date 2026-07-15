import * as https from 'node:https';
import * as http from 'node:http';

export type HttpResponse = { status: number; body: string };

type HttpRequestOptions = {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

/**
 * Client HTTP fiable basé sur node:https/http avec IPv4 forcé (`family: 4`).
 *
 * Pourquoi : dans certains réseaux Docker/hébergés, le `fetch` global (undici)
 * tente l'IPv6 (happy-eyeballs) vers des hôtes injoignables et échoue par
 * timeout intermittent (`ETIMEDOUT` / "fetch failed"). Forcer l'IPv4 rend les
 * appels aux fournisseurs de géocodage (Photon, Nominatim) et à Overpass
 * stables. À usage serveur uniquement.
 */
export function httpRequest(url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse> {
  const { method = 'GET', headers = {}, body, timeoutMs = 8000 } = opts;
  const parsed = new URL(url);
  const transport = parsed.protocol === 'http:' ? http : https;

  return new Promise<HttpResponse>((resolve, reject) => {
    const req = transport.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        family: 4,
        headers: {
          'User-Agent': 'MOVA-RDC/1.0 (ride-service; https://mova.cd)',
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    if (body) req.write(body);
    req.end();
  });
}

/** GET renvoyant du JSON typé, ou `null` si statut non-2xx / parsing impossible. */
export async function httpGetJson<T>(
  url: string,
  opts: Omit<HttpRequestOptions, 'method' | 'body'> = {},
): Promise<T | null> {
  const res = await httpRequest(url, { ...opts, method: 'GET' });
  if (res.status < 200 || res.status >= 300) return null;
  try {
    return JSON.parse(res.body) as T;
  } catch {
    return null;
  }
}
