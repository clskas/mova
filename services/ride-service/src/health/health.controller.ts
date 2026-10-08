import { Controller, Get } from '@nestjs/common';
import { MARKET_RDC } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  private liveBody() {
    return {
      status: 'ok',
      service: 'ride-service',
      version: '1.0.0',
      market: MARKET_RDC.country,
      city: MARKET_RDC.coverageLabel,
      timestamp: new Date().toISOString(),
    };
  }

  /** Process liveness for Render — no DB (avoids false kills during Postgres wake). */
  @Get('health/live')
  live() {
    return this.liveBody();
  }

  /**
   * Legacy path some Render dashboards still probe (/api/health/live).
   * Global prefix is excluded for health/*, so this is registered explicitly.
   */
  @Get('api/health/live')
  liveApiPrefixed() {
    return this.liveBody();
  }

  @Get('health')
  async health() {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'ride-service',
      version: '1.0.0',
      market: MARKET_RDC.country,
      city: MARKET_RDC.coverageLabel,
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
    };
  }
}
