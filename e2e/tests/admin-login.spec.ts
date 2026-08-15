import { test, expect } from "@playwright/test";
import { loginAsStaff, requireGateway, requireReachable } from "./helpers";

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "+243900000001";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3000";

test.describe("Admin — page de connexion", () => {
  test.beforeEach(async ({ request, baseURL }) => {
    await requireReachable(
      request,
      baseURL ?? "",
      `Admin indisponible sur ${baseURL ?? "?"}. Lancez: cd admin && npm run dev`,
    );
  });

  test("affiche SENGA Admin sur /login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("SENGA Admin", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await expect(page.getByText("Accès réservé au personnel autorisé")).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("connexion OTP redirige vers le tableau de bord", async ({ page, request }) => {
    await requireGateway(request, GATEWAY_URL);
    await loginAsStaff(page, ADMIN_PHONE);
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible({ timeout: 15_000 });
  });
});
