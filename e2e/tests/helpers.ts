import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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
      const live = await request.get(`${gatewayUrl}/health/live`, { timeout: 5_000 });
      if (!live.ok()) {
        lastError = `/health/live HTTP ${live.status()}`;
      } else {
        const health = await request.get(`${gatewayUrl}/health`, { timeout: 8_000 });
        if (health.ok()) {
          const body = (await health.json().catch(() => null)) as
            | { status?: string; services?: { name?: string; status?: string }[] }
            | null;
          const auth = body?.services?.find((s) => s.name === "auth");
          if (auth?.status === "ok") return;
          lastError = `gateway ${body?.status ?? "unknown"}, auth ${auth?.status ?? "absent"}`;
        } else {
          lastError = `/health HTTP ${health.status()}`;
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  skipOrFail(`Gateway indisponible sur ${gatewayUrl} (${lastError})`);
}

const DEV_OTP = process.env.E2E_OTP ?? "123456";

/** Ferme la bannière de mise à jour si elle recouvre le formulaire. */
export async function dismissUpdateBanner(page: Page): Promise<void> {
  const later = page.getByRole("button", { name: "Plus tard" });
  if (await later.isVisible().catch(() => false)) {
    await later.click();
  }
}

async function fillLoginPhone(page: Page, phone: string): Promise<void> {
  const tel = page.locator('input[autocomplete="tel"], input[type="tel"]').first();
  await tel.fill(phone);
}

/** Bouton principal : « Continuer » (PIN/OTP) — ne pas matcher « Continuer avec Google ». */
async function clickLoginContinue(page: Page): Promise<void> {
  const continueBtn = page.getByRole("button", { name: "Continuer", exact: true });
  const legacyOtpBtn = page.getByRole("button", { name: "Recevoir le code", exact: true });
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click();
  } else {
    await legacyOtpBtn.click();
  }
  const smsFallback = page.getByRole("button", { name: "Recevoir un code SMS" });
  if (await smsFallback.isVisible().catch(() => false)) {
    await smsFallback.click();
  }
}

async function skipPinSetupIfPresent(page: Page): Promise<void> {
  const setup = page.getByRole("heading", { name: /Créer votre code PIN|Nouveau PIN/i });
  if (await setup.isVisible().catch(() => false)) {
    throw new Error("PIN setup shown for a seed/demo account — shouldRequirePinSetup should skip +2439000000xx");
  }
}

/** Connexion staff admin (OTP mock 123456). */
export async function loginAsStaff(page: Page, phone: string): Promise<void> {
  await page.goto("/login");
  await dismissUpdateBanner(page);
  await fillLoginPhone(page, phone);
  await clickLoginContinue(page);
  const otp = page.getByRole("textbox", { name: /Code OTP/i });
  await expect(otp).toBeVisible({ timeout: 15_000 });
  await otp.fill(DEV_OTP);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await skipPinSetupIfPresent(page);
  await expect(page.getByRole("button", { name: "Déconnexion" })).toBeVisible({ timeout: 15_000 });
}
