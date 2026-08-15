import { Controller, Get } from '@nestjs/common';
import { MARKET_RDC, SERVICE_PORTS, serviceUrl } from '@mova/shared';

/**
 * Per-attempt backend probe timeout (ms).
 * Keep the default short so GET /health stays a liveness-friendly probe
 * (Playwright, load balancers, CI). Render cold starts set
 * HEALTH_CHECK_TIMEOUT_MS=45000 via render.yaml.
 */
const HEALTH_CHECK_TIMEOUT_MS = Number(process.env.HEALTH_CHECK_TIMEOUT_MS ?? 3_000);
const HEALTH_CHECK_RETRIES = Math.max(0, Number(process.env.HEALTH_CHECK_RETRIES ?? 0));

async function fetchServiceHealth(name: keyof typeof SERVICE_PORTS) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= HEALTH_CHECK_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(serviceUrl(name, '/health'), { signal: controller.signal });
      const data = await res.json();
      return { name, status: res.ok ? 'ok' : 'degraded', port: SERVICE_PORTS[name], ...data };
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timeout);
    }
  }
  const starting =
    lastError instanceof Error &&
    (lastError.name === 'AbortError' || lastError.message.includes('aborted'));
  return { name, status: starting ? 'starting' : 'down', port: SERVICE_PORTS[name] };
}

@Controller()
export class HealthController {
  /** Process liveness — does not wait on downstream services. */
  @Get('health/live')
  live() {
    return { status: 'ok', service: 'api-gateway', version: '1.0.0' };
  }

  @Get('health')
  async health() {
    const services = ['auth', 'ride', 'payment', 'driver', 'notification', 'admin'] as const;
    const checks = await Promise.all(services.map((name) => fetchServiceHealth(name)));
    const allOk = checks.every((c) => c.status === 'ok');
    return { status: allOk ? 'ok' : 'degraded', service: 'api-gateway', version: '1.0.0', market: MARKET_RDC.country, city: MARKET_RDC.coverageLabel, timestamp: new Date().toISOString(), services: checks };
  }
}
