import { expect, test, type Page } from "@playwright/test";
import { dismissUpdateBanner, requireReachable } from "./helpers";

const LIVE = {
  web: process.env.WEB_BASE_URL ?? "https://senga.afri-soft.com",
  restaurant: process.env.RESTAURANT_BASE_URL ?? "https://restaurant.afri-soft.com",
  rental: process.env.RENTAL_BASE_URL ?? "https://rental.afri-soft.com",
};

async function interceptPinEnabled(page: Page) {
  await page.route("**/api/auth/login/options", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, pinEnabled: true, phone: "+243812345678" }),
    });
  });
}

async function assertPinOnly(page: Page) {
  await dismissUpdateBanner(page);
  await expect(page.getByTestId("pin-pad")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("login-phone")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Continuer avec Google/i })).toHaveCount(0);
  await expect(page.getByTestId("pin-forgot")).toBeVisible();
}

test.describe("PIN-only after remembered phone + PIN", () => {
  test("SENGA web", async ({ page, request }) => {
    await requireReachable(request, LIVE.web, `Web indisponible: ${LIVE.web}`);
    await interceptPinEnabled(page);
    await page.goto(LIVE.web);
    await page.evaluate(() => {
      localStorage.removeItem("mova_web_token");
      localStorage.setItem("mova_web_phone", "+243812345678");
      sessionStorage.removeItem("mova_web_pin_unlocked");
    });
    await page.reload();
    await assertPinOnly(page);
  });

  test("PIN oublié affiche téléphone + Google", async ({ page, request }) => {
    await requireReachable(request, LIVE.web, `Web indisponible: ${LIVE.web}`);
    await interceptPinEnabled(page);
    await page.goto(LIVE.web);
    await page.evaluate(() => {
      localStorage.removeItem("mova_web_token");
      localStorage.setItem("mova_web_phone", "+243812345678");
      sessionStorage.removeItem("mova_web_pin_unlocked");
    });
    await page.reload();
    await assertPinOnly(page);
    await page.getByTestId("pin-forgot").click();
    await expect(page.getByText(/Récupérez l'accès par SMS.*Google/i)).toBeVisible();
    await expect(page.getByTestId("login-phone")).toBeVisible();
    await expect(page.getByTestId("pin-pad")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Recevoir un SMS/i })).toBeVisible();
    await expect(page.getByTestId("google-continue")).toBeVisible();
    await expect(page.getByRole("button", { name: /Retour au PIN/i })).toBeVisible();
  });

  test("restaurant", async ({ page, request }) => {
    await requireReachable(request, `${LIVE.restaurant}/login`, `Restaurant indisponible: ${LIVE.restaurant}`);
    await interceptPinEnabled(page);
    await page.goto(`${LIVE.restaurant}/login`);
    await page.evaluate(() => {
      localStorage.removeItem("mova_restaurant_token");
      localStorage.setItem("mova_restaurant_last_phone", "+243812345678");
      sessionStorage.removeItem("mova_restaurant_pin_unlocked");
    });
    await page.reload();
    await assertPinOnly(page);
  });

  test("rental", async ({ page, request }) => {
    await requireReachable(request, `${LIVE.rental}/login`, `Location indisponible: ${LIVE.rental}`);
    await interceptPinEnabled(page);
    await page.goto(`${LIVE.rental}/login`);
    await page.evaluate(() => {
      localStorage.removeItem("mova_rental_partner_token");
      localStorage.setItem("mova_rental_partner_last_phone", "+243812345678");
      sessionStorage.removeItem("mova_rental_partner_pin_unlocked");
    });
    await page.reload();
    await assertPinOnly(page);
  });
});
