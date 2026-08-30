import { test, expect, type Page } from "@playwright/test";
import { requireReachable } from "./helpers";

async function ensureWebHome(page: Page) {
  const homeHeading = page.getByRole("heading", { name: /SENGA — RDC/i });
  if (await homeHeading.isVisible().catch(() => false)) return;

  const loginHeading = page.getByRole("heading", { name: /SENGA — Connexion/i });
  await expect(loginHeading).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder("+243 8XX XXX XXX").fill("+243900000010");
  await page.getByRole("button", { name: "Recevoir le code" }).click();
  const otp = page.getByPlaceholder(/123456 \(démo\)|Code à 6 chiffres|Code reçu par e-mail/);
  await expect(otp).toBeVisible({ timeout: 15_000 });
  await otp.fill("123456");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(homeHeading).toBeVisible({ timeout: 15_000 });
}

test.describe("Web passager — accueil", () => {
  test.beforeEach(async ({ request, baseURL }) => {
    await requireReachable(
      request,
      baseURL ?? "",
      `Web indisponible sur ${baseURL ?? "?"}. Lancez: cd web && npm run dev`,
    );
  });

  test("affiche SENGA — RDC sur la page d'accueil", async ({ page }) => {
    await page.goto("/");
    await ensureWebHome(page);
    await expect(page.getByRole("heading", { name: /SENGA — RDC/i })).toBeVisible();
  });
});
