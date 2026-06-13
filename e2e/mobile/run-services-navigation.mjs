/**
 * E2E Appium — navigation depuis l'accueil vers chaque service majeur.
 */
import {
  connectDriver,
  ensureLoggedIn,
  ensureOnHome,
  recoverHome,
  waitForScreen,
  tapDescScroll,
  scrollToDesc,
  goBack,
  STEP_TIMEOUT_MS,
  MOCK_OTP,
  TEST_PHONE,
} from "./helpers.mjs";

/** @type {{ card: string, screen: string, altScreens?: string[], optional?: boolean }[]} */
const SERVICES = [
  { card: "Taxi", screen: "Taxi / Moto-taxi", altScreens: ["Départ", "Destination"] },
  { card: "Livraison colis", screen: "Livraison colis", altScreens: ["Adresse d'enlèvement", "Adresse de livraison"] },
  { card: "Wallet MOVA", screen: "Portefeuille", altScreens: ["Solde"] },
  { card: "Historique", screen: "Historique", altScreens: ["Vos courses"] },
  { card: "Réservation planifiée", screen: "Réservation planifiée", altScreens: ["Programmez"] },
  { card: "Livraison repas", screen: "Livraison repas", altScreens: ["Restaurant"] },
  { card: "Courses & commissions", screen: "Courses & commissions", altScreens: ["commission"] },
  { card: "Covoiturage", screen: "Covoiturage", optional: true },
  { card: "Livraison express", screen: "Livraison express", optional: true },
  { card: "Location véhicule", screen: "Location véhicule", optional: true },
  { card: "Déménagement", screen: "Déménagement", optional: true },
];

async function waitForServiceScreen(driver, { screen, altScreens = [] }) {
  const markers = [screen, ...altScreens];
  for (const marker of markers) {
    const found = await waitForScreen(driver, marker, STEP_TIMEOUT_MS);
    if (found) return true;
  }
  return false;
}

async function navigateService(driver, { card, screen, altScreens, optional }) {
  const tag = optional ? "[optionnel]" : "[requis]";
  process.stdout.write(`  ${tag} ${card} → ${screen}… `);

  try {
    await ensureOnHome(driver);
    await scrollToDesc(driver, card);
    await tapDescScroll(driver, card);

    const found = await waitForServiceScreen(driver, { screen, altScreens });
    if (!found) throw new Error(`Écran « ${screen} » non trouvé.`);

    console.log("OK");
    await goBack(driver);
    const homeOk = await recoverHome(driver);
    if (!homeOk) {
      console.warn(`  ⚠ Retour accueil incertain après ${card} — navigation suivante peut échouer.`);
    }
    return { card, ok: true, homeOk, optional: !!optional };
  } catch (err) {
    console.log(`ÉCHEC — ${err.message ?? err}`);
    try {
      await ensureOnHome(driver);
    } catch {
      /* session may be lost */
    }
    if (optional) return { card, ok: false, optional: true, error: err.message };
    throw err;
  }
}

async function main() {
  console.log("=== MOVA E2E — navigation services ===");
  console.log(`OTP mock: ${MOCK_OTP} | Téléphone: ${TEST_PHONE}`);

  const driver = await connectDriver();
  const summary = [];

  try {
    await ensureLoggedIn(driver);

    for (const service of SERVICES) {
      try {
        await ensureOnHome(driver).catch(() => recoverHome(driver));
        const result = await navigateService(driver, service);
        summary.push(result);
      } catch (err) {
        summary.push({ card: service.card, ok: false, optional: !!service.optional, error: err.message });
        if (!service.optional) break;
      }
    }

    const required = summary.filter((s) => !s.optional);
    const optional = summary.filter((s) => s.optional);
    const requiredOk = required.filter((s) => s.ok).length;
    const optionalOk = optional.filter((s) => s.ok).length;

    console.log("\n--- Résumé navigation ---");
    for (const s of summary) {
      const status = s.ok ? "OK" : s.optional ? "SKIP" : "ÉCHEC";
      console.log(`  ${s.card}: ${status}${s.error ? ` (${s.error})` : ""}`);
    }
    console.log(`\nRequis: ${requiredOk}/${required.length} | Optionnels: ${optionalOk}/${optional.length}`);

    if (requiredOk < required.length) {
      throw new Error(`${required.length - requiredOk} service(s) requis en échec.`);
    }
    console.log("\n✓ Navigation services E2E OK.");
  } finally {
    try {
      await driver.deleteSession();
    } catch (err) {
      console.warn("⚠ Fermeture session Appium:", err.message ?? err);
    }
  }
}

main().catch((err) => {
  console.error("✗ Navigation services E2E échouée:", err.message ?? err);
  process.exit(1);
});
