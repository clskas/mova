import type { APIRequestContext } from "@playwright/test";

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
