import { test, expect } from "@playwright/test";
import { requireGateway } from "./helpers";

const gatewayUrl = process.env.GATEWAY_URL ?? "http://localhost:3000";

test.describe("Passerelle API — health", () => {
  test("GET /health répond", async ({ request }) => {
    await requireGateway(request, gatewayUrl);
    const res = await request.get(`${gatewayUrl}/health`, { timeout: 15_000 });
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });
});
