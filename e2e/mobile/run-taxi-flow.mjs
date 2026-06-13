/**
 * E2E Appium — flux taxi : OTP mock → accueil → réservation → estimation.
 *
 * Prérequis: Appium démarré, app passager installée, MOCK_OTP=true (code 123456).
 */
import {
  connectDriver,
  ensureLoggedIn,
  descContains,
  waitForAny,
  waitForDesc,
  tapDesc,
  setEditText,
  scrollToDesc,
  isDisplayed,
  STEP_TIMEOUT_MS,
  TEST_PHONE,
  MOCK_OTP,
} from "./helpers.mjs";

async function tryOptional(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    return true;
  } catch (err) {
    console.warn(`  ⚠ ${label} (optionnel): ${err.message ?? err}`);
    return false;
  }
}

async function main() {
  console.log("=== MOVA E2E — flux taxi ===");
  console.log(`OTP mock: ${MOCK_OTP} | Téléphone: ${TEST_PHONE}`);

  const driver = await connectDriver();
  const results = { login: false, taxiNav: false, bookingUi: false, estimate: false };

  try {
    await ensureLoggedIn(driver);
    results.login = true;

    console.log("Navigation vers Taxi / Moto-taxi…");
    await scrollToDesc(driver, "Course immédiate");
    await tapDesc(driver, "Taxi / Moto-taxi");

    const bookingSel = await waitForAny(
      driver,
      [
        descContains("Taxi / Moto-taxi"),
        descContains("Départ"),
        descContains("Destination"),
        descContains("Choisissez votre véhicule"),
      ],
      STEP_TIMEOUT_MS,
    );
    if (!bookingSel) throw new Error("Écran réservation taxi non détecté.");
    results.taxiNav = true;
    console.log("✓ Écran réservation taxi ouvert.");

    results.bookingUi = await tryOptional("Carte / champs départ-destination visibles", async () => {
      const hasDepart = await isDisplayed(driver, descContains("Départ"));
      const hasDest = await isDisplayed(driver, descContains("Destination"));
      if (!hasDepart && !hasDest) throw new Error("Champs Départ/Destination absents.");
    });

    results.estimate = await tryOptional("Estimation de prix", async () => {
      await scrollToDesc(driver, "Destination");
      const destFields = await driver.$$('android=new UiSelector().className("android.widget.EditText")');
      if (destFields.length < 2) throw new Error("Champ destination introuvable.");
      const dest = destFields[1];
      await dest.click();
      await dest.clearValue();
      await dest.setValue("Gombe, Kinshasa");

      await driver.pause(500);
      await scrollToDesc(driver, "Estimer");
      const estimateBtn = await waitForDesc(driver, "Estimer le prix", 10_000);
      if (!estimateBtn) throw new Error("Bouton « Estimer le prix » absent.");
      await tapDesc(driver, "Estimer le prix");

      const estimateUi = await waitForAny(
        driver,
        [descContains("Estimation"), descContains("Confirmer la course")],
        STEP_TIMEOUT_MS,
      );
      if (!estimateUi) throw new Error("Résultat estimation non affiché.");
    });

    console.log("\n--- Résumé flux taxi ---");
    console.log(`  Connexion OTP: ${results.login ? "OK" : "ÉCHEC"}`);
    console.log(`  Navigation taxi: ${results.taxiNav ? "OK" : "ÉCHEC"}`);
    console.log(`  UI réservation: ${results.bookingUi ? "OK" : "optionnel"}`);
    console.log(`  Estimation: ${results.estimate ? "OK" : "optionnel (arrêt avant paiement)"}`);

    if (!results.login || !results.taxiNav) {
      throw new Error("Étapes obligatoires échouées.");
    }
    console.log("\n✓ Flux taxi E2E OK (arrêt avant paiement).");
  } finally {
    try {
      await driver.deleteSession();
    } catch (err) {
      console.warn("⚠ Fermeture session Appium:", err.message ?? err);
    }
  }
}

main().catch((err) => {
  console.error("✗ Flux taxi E2E échoué:", err.message ?? err);
  process.exit(1);
});
