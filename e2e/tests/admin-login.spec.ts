import { test, expect } from "@playwright/test";
import { isReachable } from "./helpers";

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "+243900000001";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3000";

test.describe("Admin — page de connexion", () => {
  test.beforeEach(async ({ request, baseURL }) => {
    if (!baseURL || !(await isReachable(request, baseURL))) {
      test.skip(true, `Admin indisponible sur ${baseURL ?? "?"}. Lancez: cd admin && npm run dev`);
    }
  });

  test("affiche MOVA Admin sur /login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "MOVA Admin" })).toBeVisible();
    await expect(page.getByText("Connexion sécurisée")).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("connexion OTP redirige vers le tableau de bord", async ({ page, request }) => {
    try {
      const health = await request.get(`${GATEWAY_URL}/health`, { timeout: 5_000 });
      if (!health.ok()) test.skip(true, `Gateway indisponible sur ${GATEWAY_URL}`);
    } catch {
      test.skip(true, `Gateway indisponible sur ${GATEWAY_URL}`);
    }
    await page.goto("/login");
    await page.getByPlaceholder("+243900000001").fill(ADMIN_PHONE);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible({ timeout: 15_000 });
  });
});
