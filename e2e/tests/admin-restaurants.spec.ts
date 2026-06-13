import { test, expect } from "@playwright/test";
import { isReachable } from "./helpers";

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "+243900000001";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3000";

test.describe("Admin — restaurants CRUD", () => {
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

  test("page restaurants charge le formulaire et la liste", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("+243900000001").fill(ADMIN_PHONE);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "Restaurants" }).click();
    await expect(page.getByRole("heading", { name: "Restaurants" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Ajouter un restaurant")).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer" })).toBeVisible();
    await expect(page.getByText("Chargement…")).not.toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("columnheader", { name: "Nom" }).or(page.getByText("Aucun restaurant"))
    ).toBeVisible({ timeout: 15_000 });
  });
});
