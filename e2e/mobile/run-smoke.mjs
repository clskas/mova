/**
 * Smoke test Appium — lance l'app passager et vérifie l'écran OTP.
 *
 * Prérequis:
 *   1. Appium 2.x + driver uiautomator2 (npm run appium:install-drivers)
 *   2. Appareil Android connecté (adb devices) OU émulateur
 *   3. APK construit OU app déjà installée (USE_INSTALLED_APP=true)
 *   4. Serveur Appium: npm run appium:start (autre terminal)
 */
import { remote } from "webdriverio";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const host = process.env.APPIUM_HOST ?? "127.0.0.1";
const port = Number(process.env.APPIUM_PORT ?? "4723");
const useInstalled = (process.env.USE_INSTALLED_APP ?? "true").toLowerCase() === "true";
const apkEnv = process.env.APK_PATH ?? "../../mobile/build/app/outputs/flutter-apk/app-passenger-debug.apk";
const apkPath = resolve(__dirname, apkEnv);

const PASSENGER_PACKAGE = "cd.mova.mova.passenger";
const MAIN_ACTIVITY = "cd.mova.mova.MainActivity";

function buildCapabilities() {
  const base = {
    platformName: "Android",
    "appium:automationName": "UiAutomator2",
    "appium:deviceName": process.env.ANDROID_DEVICE ?? "Android",
    "appium:autoGrantPermissions": true,
    "appium:newCommandTimeout": 120,
  };

  if (!useInstalled && existsSync(apkPath)) {
    return { ...base, "appium:app": apkPath };
  }

  if (!useInstalled && !existsSync(apkPath)) {
    throw new Error(
      `APK introuvable: ${apkPath}\n` +
        "Construisez l'APK: cd mobile && flutter build apk --debug --flavor passenger -t lib/main_passenger.dart\n" +
        "Ou définissez USE_INSTALLED_APP=true si l'app est déjà sur l'appareil.",
    );
  }

  return {
    ...base,
    "appium:appPackage": PASSENGER_PACKAGE,
    "appium:appActivity": MAIN_ACTIVITY,
    "appium:noReset": true,
  };
}

async function main() {
  console.log(`Connexion Appium ${host}:${port}…`);
  const driver = await remote({
    hostname: host,
    port,
    path: "/",
    logLevel: "warn",
    capabilities: buildCapabilities(),
  });

  try {
    console.log("Recherche de l'écran passager (OTP ou accueil)…");
    const selectors = [
      'android=new UiSelector().descriptionContains("Bienvenue")',
      'android=new UiSelector().descriptionContains("Taxi")',
      'android=new UiSelector().descriptionContains("Livraison colis")',
      'android=new UiSelector().description("Connexion MOVA")',
    ];
    const deadline = Date.now() + 20_000;
    let matched = null;
    while (Date.now() < deadline && !matched) {
      for (const sel of selectors) {
        const el = await driver.$(sel);
        if (await el.isDisplayed().catch(() => false)) {
          matched = sel;
          break;
        }
      }
      if (!matched) await driver.pause(500);
    }
    if (!matched) throw new Error("Aucun écran passager reconnu (OTP ou accueil services).");
    console.log("✓ Smoke test OK — app passager visible.");
  } finally {
    try {
      await driver.deleteSession();
    } catch (err) {
      console.warn("⚠ Fermeture session Appium:", err.message ?? err);
    }
  }
}

main().catch((err) => {
  console.error("✗ Smoke test mobile échoué:", err.message ?? err);
  process.exit(1);
});
