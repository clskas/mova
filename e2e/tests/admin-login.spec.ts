import { test, expect } from "@playwright/test";
import { isReachable } from "./helpers";

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
});
