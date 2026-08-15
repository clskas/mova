import { test, expect } from "@playwright/test";
import { loginAsStaff, requireGateway, requireReachable } from "./helpers";

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "+243900000001";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3000";

test.describe("Admin — restaurants CRUD", () => {
  test.beforeEach(async ({ request, baseURL }) => {
    await requireReachable(
      request,
      baseURL ?? "",
      `Admin indisponible sur ${baseURL ?? "?"}. Lancez: cd admin && npm run dev`,
    );
    await requireGateway(request, GATEWAY_URL);
  });

  test("page restaurants charge le formulaire et la liste", async ({ page }) => {
    await loginAsStaff(page, ADMIN_PHONE);
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "Restaurants", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Restaurants" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Ajouter un restaurant")).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer" })).toBeVisible();
    await expect(page.getByText("Chargement…")).not.toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("columnheader", { name: "Nom" }).or(page.getByText("Aucun restaurant"))
    ).toBeVisible({ timeout: 15_000 });
  });
});
