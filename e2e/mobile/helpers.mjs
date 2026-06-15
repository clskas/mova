/**
 * Helpers partagés pour les tests Appium mobile MOVA.
 * Flutter expose les libellés via content-desc (accessibilité).
 *
 * Appareil physique : l'APK doit cibler la passerelle LAN (ex. 192.168.1.64:3000).
 * Voir scripts/build-mobile-debug.ps1 — les tests Appium n'injectent pas API_URL.
 */
import { remote } from "webdriverio";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PASSENGER_PACKAGE = "cd.mova.mova.passenger";
export const MAIN_ACTIVITY = "cd.mova.mova.MainActivity";
export const TEST_PHONE = process.env.E2E_TEST_PHONE ?? "+243812345678";
export const MOCK_OTP = process.env.E2E_MOCK_OTP ?? "123456";

const host = process.env.APPIUM_HOST ?? "127.0.0.1";
const port = Number(process.env.APPIUM_PORT ?? "4723");
const useInstalled = (process.env.USE_INSTALLED_APP ?? "true").toLowerCase() === "true";
const apkEnv = process.env.APK_PATH ?? "../../mobile/build/app/outputs/flutter-apk/app-passenger-debug.apk";
const apkPath = resolve(__dirname, apkEnv);

export const STEP_TIMEOUT_MS = Number(process.env.E2E_STEP_TIMEOUT_MS ?? "30000");

/** @param {string} text */
export function descContains(text) {
  const escaped = text.replace(/"/g, '\\"');
  return `android=new UiSelector().descriptionContains("${escaped}")`;
}

/** @param {string} text */
export function scrollIntoView(text) {
  const escaped = text.replace(/"/g, '\\"');
  return `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().descriptionContains("${escaped}"))`;
}

export function buildCapabilities() {
  const base = {
    platformName: "Android",
    "appium:automationName": "UiAutomator2",
    "appium:deviceName": process.env.ANDROID_DEVICE ?? "Android",
    "appium:autoGrantPermissions": true,
    "appium:newCommandTimeout": 180,
  };

  if (!useInstalled && existsSync(apkPath)) {
    return { ...base, "appium:app": apkPath };
  }

  if (!useInstalled && !existsSync(apkPath)) {
    throw new Error(
      `APK introuvable: ${apkPath}\n` +
        "Construisez l'APK ou définissez USE_INSTALLED_APP=true.",
    );
  }

  return {
    ...base,
    "appium:appPackage": PASSENGER_PACKAGE,
    "appium:appActivity": MAIN_ACTIVITY,
    "appium:noReset": true,
  };
}

export async function connectDriver() {
  console.log(`Connexion Appium ${host}:${port}…`);
  return remote({
    hostname: host,
    port,
    path: "/",
    logLevel: "warn",
    capabilities: buildCapabilities(),
  });
}

/**
 * @param {import('webdriverio').Browser} driver
 * @param {string} selector
 */
export async function isDisplayed(driver, selector) {
  const el = await driver.$(selector);
  return el.isDisplayed().catch(() => false);
}

/**
 * @param {import('webdriverio').Browser} driver
 * @param {string[]} selectors
 * @param {number} [timeoutMs]
 */
export async function waitForAny(driver, selectors, timeoutMs = STEP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      if (await isDisplayed(driver, sel)) return sel;
    }
    await driver.pause(400);
  }
  return null;
}

/**
 * @param {import('webdriverio').Browser} driver
 * @param {string} text
 * @param {number} [timeoutMs]
 */
export async function waitForDesc(driver, text, timeoutMs = STEP_TIMEOUT_MS) {
  const sel = descContains(text);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isDisplayed(driver, sel)) return sel;
    await driver.pause(400);
  }
  return null;
}

/** @param {string} text */
export function textContains(text) {
  const escaped = text.replace(/"/g, '\\"');
  return `android=new UiSelector().textContains("${escaped}")`;
}

/**
 * @param {import('webdriverio').Browser} driver
 * @param {string} text
 * @param {number} [timeoutMs]
 */
export async function waitForScreen(driver, text, timeoutMs = STEP_TIMEOUT_MS) {
  return waitForAny(driver, [descContains(text), textContains(text)], timeoutMs);
}

/**
 * Scroll puis tap sur le premier élément correspondant.
 * @param {import('webdriverio').Browser} driver
 * @param {string} text
 */
export async function tapDescScroll(driver, text) {
  await scrollToDesc(driver, text);
  const selectors = [descContains(text), textContains(text)];
  for (const sel of selectors) {
    const el = await driver.$(sel);
    if (await el.isDisplayed().catch(() => false)) {
      await el.click();
      await driver.pause(600);
      return;
    }
  }
  throw new Error(`Élément « ${text} » introuvable pour tap.`);
}

/** Alias — scroll + tap. */
export async function tapDesc(driver, text) {
  return tapDescScroll(driver, text);
}

/**
 * @param {import('webdriverio').Browser} driver
 * @param {string} text
 */
export async function scrollToDesc(driver, text) {
  try {
    const el = await driver.$(scrollIntoView(text));
    await el.waitForExist({ timeout: STEP_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import('webdriverio').Browser} driver
 * @param {number} instance
 */
export async function setEditText(driver, instance, value) {
  const sel = `android=new UiSelector().className("android.widget.EditText").instance(${instance})`;
  const el = await driver.$(sel);
  await el.waitForDisplayed({ timeout: STEP_TIMEOUT_MS });
  await el.click();
  await el.clearValue();
  await el.setValue(value);
}

/** @param {import('webdriverio').Browser} driver */
export async function isOnHome(driver) {
  // Grille d'accueil : plusieurs cartes services (pas un écran AppBar « Taxi / … » seul).
  const wallet = await isDisplayed(driver, descContains("Wallet MOVA"));
  const parcel = await isDisplayed(driver, descContains("Livraison colis"));
  const taxiCard = await isDisplayed(driver, descContains("Course immédiate"));
  return (wallet && parcel) || (wallet && taxiCard) || (parcel && taxiCard);
}

/** @param {import('webdriverio').Browser} driver */
export async function isOnOtp(driver) {
  return (
    (await isDisplayed(driver, descContains("Bienvenue"))) ||
    (await isDisplayed(driver, 'android=new UiSelector().description("Connexion MOVA")'))
  );
}

/**
 * Connexion OTP mock ou détection accueil déjà connecté.
 * @param {import('webdriverio').Browser} driver
 */
export async function ensureLoggedIn(driver) {
  console.log("Vérification session (OTP ou accueil)…");
  await driver.pause(1500);

  if (await isOnHome(driver)) {
    console.log("✓ Déjà sur l'accueil.");
    return;
  }

  if (!(await isOnOtp(driver))) {
    if (await isOnHome(driver)) {
      console.log("✓ Accueil détecté.");
      return;
    }
    for (let i = 0; i < 5; i++) {
      await goBack(driver);
      if (await isOnHome(driver)) {
        console.log("✓ Accueil détecté (retour arrière).");
        return;
      }
      if (await isOnOtp(driver)) break;
    }
    if (await isOnOtp(driver)) {
      /* continue OTP flow below */
    } else if (await isOnHome(driver)) {
      console.log("✓ Accueil détecté.");
      return;
    } else {
      try {
        await driver.execute("mobile: startActivity", {
          component: `${PASSENGER_PACKAGE}/${MAIN_ACTIVITY}`,
        });
        await driver.pause(2500);
      } catch {
        /* ignore */
      }
      if (await isOnHome(driver)) {
        console.log("✓ Accueil détecté (relance activité).");
        return;
      }
      if (await isOnOtp(driver)) {
        /* continue OTP flow */
      } else {
        throw new Error("Écran inconnu — ni OTP ni accueil.");
      }
    }
  }

  if (!(await isOnOtp(driver))) {
    return;
  }

  console.log(`Connexion OTP (téléphone ${TEST_PHONE}, code ${MOCK_OTP})…`);
  await setEditText(driver, 0, TEST_PHONE);
  await tapDesc(driver, "Recevoir le code");

  const codeField = await waitForAny(
    driver,
    [descContains("Code OTP"), 'android=new UiSelector().className("android.widget.EditText").instance(1)'],
    STEP_TIMEOUT_MS,
  );
  if (!codeField) throw new Error("Champ OTP non affiché après demande de code.");

  const editCount = (await driver.$$('android=new UiSelector().className("android.widget.EditText")')).length;
  const codeIndex = editCount > 1 ? 1 : 0;
  await setEditText(driver, codeIndex, MOCK_OTP);

  await tapDesc(driver, "Vérifier");

  const home = await waitForAny(
    driver,
    [
      descContains("Wallet MOVA"),
      descContains("Course immédiate"),
      descContains("Solde, recharge"),
    ],
    STEP_TIMEOUT_MS,
  );
  if (!home) throw new Error("Accueil non atteint après vérification OTP.");
  console.log("✓ Connexion OTP réussie — accueil visible.");
}

/** @param {import('webdriverio').Browser} driver */
export async function goBack(driver) {
  await driver.back();
  await driver.pause(800);
}

/** @param {import('webdriverio').Browser} driver */
export async function ensureOnHome(driver) {
  if (await isOnHome(driver)) return;
  for (let i = 0; i < 8; i++) {
    await goBack(driver);
    if (await isOnHome(driver)) {
      await scrollToDesc(driver, "Wallet MOVA");
      return;
    }
  }
  try {
    await driver.execute("mobile: startActivity", {
      component: `${PASSENGER_PACKAGE}/${MAIN_ACTIVITY}`,
    });
    await driver.pause(3000);
    await scrollToDesc(driver, "Wallet MOVA");
  } catch {
    /* ignore */
  }
  if (await isOnHome(driver)) return;
  const loose = await waitForAny(
    driver,
    [descContains("Wallet MOVA"), descContains("Historique"), descContains("Course immédiate")],
    10_000,
  );
  if (loose) return;
  throw new Error("Impossible de revenir à l'accueil.");
}

/** @param {import('webdriverio').Browser} driver */
export async function recoverHome(driver) {
  try {
    await ensureOnHome(driver);
    return true;
  } catch {
    return false;
  }
}
