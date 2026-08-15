import { test, type APIRequestContext } from "@playwright/test";

/** En CI, les tests doivent échouer si la stack n'est pas prête (pas de skip silencieux). */
export const e2eStrict =
  process.env.CI === "true" || process.env.E2E_REQUIRE_STACK === "true";

/** Ignore le test en local ; échoue en CI si la stack est absente. */
export function skipOrFail(message: string): void {
  if (e2eStrict) throw new Error(message);
  test.skip(true, message);
}

/** Vérifie si une URL répond avec du HTML (app Next.js), pas une API JSON. */
export async function isReachable(
  request: APIRequestContext,
  url: string,
): Promise<boolean> {
  try {
    const res = await request.get(url, { timeout: 3_000 });
    if (res.status() >= 500) return false;
    const contentType = res.headers()["content-type"] ?? "";
    return contentType.includes("text/html");
  } catch {
    return false;
  }
}

export async function requireReachable(
  request: APIRequestContext,
  url: string,
  message: string,
): Promise<void> {
  if (!(await isReachable(request, url))) skipOrFail(message);
}

export async function requireGateway(
  request: APIRequestContext,
  gatewayUrl: string,
): Promise<void> {
  const attempts = e2eStrict ? 8 : 1;
  let lastError = "injoignable";
  for (let i = 0; i < attempts; i++) {
    try {
      const health = await request.get(`${gatewayUrl}/health`, { timeout: 15_000 });
      if (health.ok()) return;
      lastError = `HTTP ${health.status()}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  skipOrFail(`Gateway indisponible sur ${gatewayUrl} (${lastError})`);
}
