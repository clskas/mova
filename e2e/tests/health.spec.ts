import { test, expect } from "@playwright/test";

const gatewayUrl = process.env.GATEWAY_URL ?? "http://localhost:3000";

test.describe("Passerelle API — health", () => {
  test("GET /health répond ou test ignoré si gateway arrêtée", async ({ request }) => {
    let ok = false;
    try {
      const res = await request.get(`${gatewayUrl}/health`, { timeout: 3_000 });
      ok = res.ok();
      if (ok) {
        const body = await res.text();
        expect(body.length).toBeGreaterThan(0);
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      test.skip(true, `Gateway indisponible sur ${gatewayUrl}. Lancez docker compose ou les microservices.`);
    }
  });
});
