const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

async function make(dir, color, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="${color}"/>
  <text x="256" y="300" font-family="Arial,Helvetica,sans-serif" font-size="160" font-weight="700" text-anchor="middle" fill="white">${label}</text>
</svg>`;
  const buf = Buffer.from(svg);
  for (const size of [192, 512, 180]) {
    await sharp(buf).resize(size, size).png().toFile(path.join(dir, `icon-${size}.png`));
  }
  fs.copyFileSync(path.join(dir, "icon-180.png"), path.join(dir, "apple-touch-icon.png"));
  const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${color}"/>
  <text x="256" y="300" font-family="Arial,Helvetica,sans-serif" font-size="120" font-weight="700" text-anchor="middle" fill="white">${label}</text>
</svg>`;
  await sharp(Buffer.from(maskable)).png().toFile(path.join(dir, "icon-512-maskable.png"));
  console.log("ok", dir);
}

(async () => {
  const root = path.join(__dirname, "..");
  await make(path.join(root, "restaurant/public"), "#FF6B35", "R");
  await make(path.join(root, "rental-partner/public"), "#6366f1", "L");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
