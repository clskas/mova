import { test, expect } from "@playwright/test";
import { requireReachable } from "./helpers";

test.describe("Web passager — accueil", () => {
  test.beforeEach(async ({ request, baseURL }) => {
    await requireReachable(
      request,
      baseURL ?? "",
      `Web indisponible sur ${baseURL ?? "?"}. Lancez: cd web && npm run dev`,
    );
  });

  test("affiche MOVA — RDC sur la page d'accueil", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /MOVA — RDC/i })).toBeVisible();
  });
});
