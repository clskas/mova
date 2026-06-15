import { Controller, Get } from '@nestjs/common';
import { MARKET_RDC, SERVICE_PORTS, serviceUrl } from '@mova/shared';

@Controller()
export class HealthController {
  @Get('health')
  async health() {
    const services = ['auth', 'ride', 'payment', 'driver', 'notification', 'admin'] as const;
    const checks = await Promise.all(
      services.map(async (name) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          try {
            const res = await fetch(serviceUrl(name, '/health'), { signal: controller.signal });
            const data = await res.json();
            return { name, status: res.ok ? 'ok' : 'degraded', port: SERVICE_PORTS[name], ...data };
          } finally {
            clearTimeout(timeout);
          }
        } catch {
          return { name, status: 'down', port: SERVICE_PORTS[name] };
        }
      }),
    );
    const allOk = checks.every((c) => c.status === 'ok');
    return { status: allOk ? 'ok' : 'degraded', service: 'api-gateway', version: '1.0.0', market: MARKET_RDC.country, city: MARKET_RDC.coverageLabel, timestamp: new Date().toISOString(), services: checks };
  }
}
