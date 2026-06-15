import { Controller, Get } from '@nestjs/common';
import { MARKET_RDC } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Get('health')
  async health() {
    let dbOk = false;
    try { await this.prisma.$queryRaw`SELECT 1`; dbOk = true; } catch { dbOk = false; }
    return { status: dbOk ? 'ok' : 'degraded', service: 'notification-service', version: '1.0.0', market: MARKET_RDC.country, city: MARKET_RDC.coverageLabel, timestamp: new Date().toISOString(), database: dbOk ? 'connected' : 'disconnected' };
  }
}
