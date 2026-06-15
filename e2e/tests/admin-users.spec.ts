import { test, expect } from "@playwright/test";
import { requireGateway, requireReachable } from "./helpers";

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
    await requireReachable(
      request,
      baseURL ?? "",
      `Admin indisponible sur ${baseURL ?? "?"}. Lancez: cd admin && npm run dev`,
    );
    await requireGateway(request, GATEWAY_URL);
  });

  test("page Utilisateurs affiche le tableau", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Utilisateurs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Utilisateurs" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/Rechercher/)).toBeVisible();
    await expect(page.getByText("Chargement…")).not.toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("columnheader", { name: "Téléphone" }).or(page.getByText("Aucun utilisateur"))
    ).toBeVisible({ timeout: 15_000 });
  });
});
