import { test, expect } from "@playwright/test";
import { isReachable } from "./helpers";

test.describe("Web passager — accueil", () => {
  test.beforeEach(async ({ request, baseURL }) => {
    if (!baseURL || !(await isReachable(request, baseURL))) {
      test.skip(true, `Web indisponible sur ${baseURL ?? "?"}. Lancez: cd web && npm run dev`);
    }
  });

  test("affiche MOVA — RDC sur la page d'accueil", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /MOVA — RDC/i })).toBeVisible();
  });
});
