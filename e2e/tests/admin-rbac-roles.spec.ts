import { test, expect, type Page } from "@playwright/test";
import { requireGateway, requireReachable } from "./helpers";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3000";
const OTP = "123456";

type StaffRole = "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "FINANCE" | "CONTENT";

const STAFF_ACCOUNTS: { phone: string; role: StaffRole; label: string }[] = [
  { phone: "+243900000001", role: "SUPER_ADMIN", label: "Super admin" },
  { phone: "+243900000002", role: "ADMIN", label: "Administrateur" },
  { phone: "+243900000003", role: "SUPPORT", label: "Support" },
  { phone: "+243900000004", role: "FINANCE", label: "Finance" },
  { phone: "+243900000005", role: "CONTENT", label: "Contenu" },
];

/** Mirrors admin/src/lib/rbac.ts ROLE_SECTIONS labels. */
const MENU_BY_ROLE: Record<StaffRole, string[]> = {
  SUPER_ADMIN: [
    "Tableau de bord", "Utilisateurs", "Chauffeurs", "KYC", "Courses", "Livraisons",
    "Restaurants", "Tarifs", "Abonnements", "Portefeuille", "Litiges", "Planifiées", "Communes", "Locations",
  ],
  ADMIN: [
    "Tableau de bord", "Utilisateurs", "Chauffeurs", "KYC", "Courses", "Livraisons",
    "Restaurants", "Tarifs", "Abonnements", "Portefeuille", "Litiges", "Planifiées", "Communes", "Locations",
  ],
  SUPPORT: [
    "Utilisateurs", "Chauffeurs", "KYC", "Litiges", "Courses", "Livraisons", "Planifiées", "Locations",
  ],
  FINANCE: ["Tableau de bord", "Portefeuille", "Tarifs", "Abonnements"],
  CONTENT: ["Restaurants", "Tarifs", "Communes", "Locations"],
};

const HIDDEN_FOR_SUPPORT = ["Restaurants", "Abonnements", "Portefeuille", "Tableau de bord"];

async function loginAs(page: Page, phone: string): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("+243900000001").fill(phone);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: "Déconnexion" })).toBeVisible({ timeout: 15_000 });
}

test.describe("Admin — RBAC par rôle staff", () => {
  test.beforeEach(async ({ request, baseURL }) => {
    await requireReachable(
      request,
      baseURL ?? "",
      `Admin indisponible sur ${baseURL ?? "?"}. Lancez: cd admin && npm run dev`,
    );
    await requireGateway(request, GATEWAY_URL);
  });

  for (const { phone, role, label } of STAFF_ACCOUNTS) {
    test(`${role} (${phone}) — menu et badge`, async ({ page }) => {
      await loginAs(page, phone);
      await expect(page.getByText(label, { exact: true })).toBeVisible();

      for (const item of MENU_BY_ROLE[role]) {
        await expect(page.getByRole("link", { name: item, exact: true })).toBeVisible();
      }

      if (role === "SUPPORT") {
        for (const hidden of HIDDEN_FOR_SUPPORT) {
          await expect(page.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
        }
      }
    });
  }

  test("SUPER_ADMIN — écriture tarifs", async ({ page }) => {
    await loginAs(page, "+243900000001");
    await page.goto("/tarifs");
    await expect(page.getByText("Accès lecture seule pour votre rôle.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enregistrer" }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("SUPPORT — utilisateurs lecture seule, pas de menu Tarifs", async ({ page }) => {
    await loginAs(page, "+243900000003");
    await expect(page.getByRole("link", { name: "Tarifs", exact: true })).toHaveCount(0);
    await page.goto("/utilisateurs");
    await expect(page.getByText(/Consultation des comptes \(\d+ au total\)/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
  });
});
