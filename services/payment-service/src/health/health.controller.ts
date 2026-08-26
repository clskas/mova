import { Controller, Get } from '@nestjs/common';
import { afrisoftPayHubBaseUrl, isAfrisoftPayHubMode, MARKET_RDC } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Get('health')
  async health() {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const envGet = (key: string) => process.env[key];
    const hubMode = isAfrisoftPayHubMode(envGet);
    const hubUrl = afrisoftPayHubBaseUrl(envGet);
    let hubReachable = hubMode;
    if (!hubMode) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(`${hubUrl.replace(/\/$/, '')}/health`, { signal: controller.signal });
        hubReachable = res.ok;
      } catch {
        hubReachable = false;
      } finally {
        clearTimeout(timer);
      }
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'payment-service',
      version: '1.0.0',
      market: MARKET_RDC.country,
      city: MARKET_RDC.coverageLabel,
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
      payHub: { url: hubUrl, mode: hubMode ? 'hub' : 'client', reachable: hubReachable },
    };
  }
}
