/**
 * Génère les icônes MOVA — une identité distincte par application (modèle Uber) :
 *   - Passager   : pin + route, dégradé violet      -> web/ + admin/ + mobile (flavor passenger)
 *   - Chauffeur  : volant, dégradé vert             -> mobile (flavor driver)
 *   - Restaurant : cloche + couverts, dégradé orange-> restaurant/
 *   - Location   : clé de voiture, dégradé bleu     -> rental-partner/
 *
 * Masters : scripts/mova-icon-*.png
 * Usage   : node scripts/generate-mova-icons.js
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const pngToIcoModule = require("png-to-ico");
const pngToIco = pngToIcoModule.default || pngToIcoModule;

const ROOT = path.join(__dirname, "..");
const DARK = "#0D0D1A"; // fond opaque neutre (là où le master est transparent)

const MASTERS = {
  passenger: path.join(ROOT, "scripts", "mova-icon-master.png"),
  driver: path.join(ROOT, "scripts", "mova-icon-driver.png"),
  restaurant: path.join(ROOT, "scripts", "mova-icon-restaurant.png"),
  location: path.join(ROOT, "scripts", "mova-icon-location.png"),
};

for (const [k, p] of Object.entries(MASTERS)) {
  if (!fs.existsSync(p)) throw new Error(`Master manquant (${k}) : ${p}`);
}

// PNG opaque plein cadre
function full(master, size) {
  return sharp(master).resize(size, size, { fit: "cover" }).flatten({ background: DARK }).png();
}

// PNG "maskable" : contenu réduit (zone de sécurité) sur fond plein
async function maskable(master, size) {
  const inner = Math.round(size * 0.8);
  const fg = await sharp(master).resize(inner, inner, { fit: "cover" }).flatten({ background: DARK }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: DARK } })
    .composite([{ input: fg, gravity: "center" }])
    .png();
}

// Foreground adaptatif Android : contenu réduit sur fond transparent
async function adaptiveForeground(master, size) {
  const inner = Math.round(size * 0.66);
  const fg = await sharp(master).resize(inner, inner, { fit: "cover" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fg, gravity: "center" }])
    .png();
}

async function writeFull(master, dir, name, size) {
  const out = path.join(dir, name);
  await full(master, size).toFile(out);
  console.log("  ", path.relative(ROOT, out));
}

async function writeMaskable(master, dir, name, size) {
  const out = path.join(dir, name);
  await (await maskable(master, size)).toFile(out);
  console.log("  ", path.relative(ROOT, out));
}

async function writeIco(master, dir) {
  const bufs = [];
  for (const s of [16, 32, 48, 64]) bufs.push(await full(master, s).toBuffer());
  fs.writeFileSync(path.join(dir, "favicon.ico"), await pngToIco(bufs));
  console.log("  ", path.relative(ROOT, path.join(dir, "favicon.ico")));
}

async function writeAppFavicon(master, appDir) {
  // Next.js App Router : favicon.ico servi depuis src/app/
  const appIcoDir = path.join(appDir, "src", "app");
  if (fs.existsSync(appIcoDir)) {
    const bufs = [];
    for (const s of [16, 32, 48, 64]) bufs.push(await full(master, s).toBuffer());
    fs.writeFileSync(path.join(appIcoDir, "favicon.ico"), await pngToIco(bufs));
    console.log("  ", path.relative(ROOT, path.join(appIcoDir, "favicon.ico")));
  }
}

async function writeSvgEmbed(master, dir) {
  const b64 = (await full(master, 256).toBuffer()).toString("base64");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${b64}"/></svg>\n`;
  fs.writeFileSync(path.join(dir, "icon.svg"), svg);
  console.log("  ", path.relative(ROOT, path.join(dir, "icon.svg")));
}

async function webApp(appName, master, { maskableIcon = false, svg = false, appFavicon = false, apple = false } = {}) {
  const dir = path.join(ROOT, appName, "public");
  console.log(`${appName}/public`);
  await writeFull(master, dir, "favicon.png", 32);
  await writeFull(master, dir, "icon-192.png", 192);
  await writeFull(master, dir, "icon-512.png", 512);
  if (maskableIcon) await writeMaskable(master, dir, "icon-512-maskable.png", 512);
  if (apple) {
    await writeFull(master, dir, "icon-180.png", 180);
    await writeFull(master, dir, "apple-touch-icon.png", 180);
  }
  if (svg) await writeSvgEmbed(master, dir);
  if (appFavicon) await writeAppFavicon(master, path.join(ROOT, appName));
  else await writeIco(master, dir);
}

async function mobileFlavor(flavor, master) {
  const dir = path.join(ROOT, "mobile", "assets", "icon");
  // Icône complète (legacy + fond adaptatif Android) : dégradé + symbole, plein cadre.
  // Utiliser le design complet comme fond adaptatif préserve le dégradé sur Android 8+.
  await full(master, 1024).toFile(path.join(dir, `movaicone_${flavor}.png`));
  console.log(`   mobile/assets/icon/movaicone_${flavor}.png`);
  // Avant-plan adaptatif transparent (le design complet est déjà dans le fond).
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toFile(path.join(dir, `movaicone_${flavor}_fg.png`));
  console.log(`   mobile/assets/icon/movaicone_${flavor}_fg.png`);
}

async function main() {
  // Apps web
  await webApp("web", MASTERS.passenger, { apple: false, appFavicon: true });
  await webApp("admin", MASTERS.passenger, { apple: true, svg: true, appFavicon: true });
  await webApp("restaurant", MASTERS.restaurant, { maskableIcon: true, apple: true, svg: true });
  await webApp("rental-partner", MASTERS.location, { maskableIcon: true, apple: true, svg: true });

  // Mobile — un master par flavor
  console.log("mobile/assets/icon");
  await mobileFlavor("passenger", MASTERS.passenger);
  await mobileFlavor("driver", MASTERS.driver);

  console.log("\nTerminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
