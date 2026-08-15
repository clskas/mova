import { test, expect } from "@playwright/test";
import { loginAsStaff, requireGateway, requireReachable } from "./helpers";

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "+243900000001";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3000";

test.describe("Admin — liste utilisateurs", () => {
  test.beforeEach(async ({ request, baseURL }) => {
    await requireReachable(
      request,
      baseURL ?? "",
      `Admin indisponible sur ${baseURL ?? "?"}. Lancez: cd admin && npm run dev`,
    );
    await requireGateway(request, GATEWAY_URL);
  });

  test("page Utilisateurs affiche le tableau", async ({ page }) => {
    await loginAsStaff(page, ADMIN_PHONE);
    await page.getByRole("link", { name: "Utilisateurs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Utilisateurs" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/Rechercher/)).toBeVisible();
    await expect(page.getByText("Chargement…")).not.toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("columnheader", { name: "Téléphone" }).or(page.getByText("Aucun utilisateur"))
    ).toBeVisible({ timeout: 15_000 });
  });
});
