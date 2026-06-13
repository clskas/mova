import { test, expect } from "@playwright/test";
import { isReachable } from "./helpers";

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "+243900000001";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3000";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByPlaceholder("+243900000001").fill(ADMIN_PHONE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible({ timeout: 15_000 });
}

test.describe("Admin — liste utilisateurs", () => {
  test.beforeEach(async ({ request, baseURL }) => {
    if (!baseURL || !(await isReachable(request, baseURL))) {
      test.skip(true, `Admin indisponible sur ${baseURL ?? "?"}. Lancez: cd admin && npm run dev`);
    }
    try {
      const health = await request.get(`${GATEWAY_URL}/health`, { timeout: 5_000 });
      if (!health.ok()) test.skip(true, `Gateway indisponible sur ${GATEWAY_URL}`);
    } catch {
      test.skip(true, `Gateway indisponible sur ${GATEWAY_URL}`);
    }
  });

  test("page Utilisateurs affiche le tableau", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Utilisateurs" }).click();
    await expect(page.getByRole("heading", { name: "Utilisateurs" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/Rechercher/)).toBeVisible();
    await expect(page.getByText("Chargement…")).not.toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("columnheader", { name: "Téléphone" }).or(page.getByText("Aucun utilisateur"))
    ).toBeVisible({ timeout: 15_000 });
  });
});
