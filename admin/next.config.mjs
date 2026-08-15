import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const buildId = (
  process.env.NEXT_PUBLIC_BUILD_ID ||
  process.env.GITHUB_SHA ||
  process.env.RENDER_GIT_COMMIT ||
  process.env.SOURCE_VERSION ||
  ""
).trim() || `dev-${Date.now()}`;

const root = dirname(fileURLToPath(import.meta.url));
const versionPath = join(root, "public", "version.json");
const versionBody = JSON.stringify({
  buildId,
  version: process.env.npm_package_version ?? "0.1.0",
});
mkdirSync(join(root, "public"), { recursive: true });
try {
  if (readFileSync(versionPath, "utf8") !== versionBody) writeFileSync(versionPath, versionBody);
} catch {
  writeFileSync(versionPath, versionBody);
}

const noStore = "no-store, no-cache, must-revalidate, max-age=0";

/** @type {import('next').NextConfig} */
const nextConfig = {
  generateBuildId: () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: noStore }],
      },
      {
        source: "/login",
        headers: [{ key: "Cache-Control", value: noStore }],
      },
      {
        source: "/version.json",
        headers: [
          { key: "Cache-Control", value: noStore },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/api/version",
        headers: [
          { key: "Cache-Control", value: noStore },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: noStore },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
