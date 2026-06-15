import { Controller, Get } from '@nestjs/common';
import { MARKET_RDC } from '@mova/shared';

@Controller()
export class HealthController {
  
  @Get('health')
  async health() {
    const dbOk = true;
    return { status: dbOk ? 'ok' : 'degraded', service: 'admin-service', version: '1.0.0', market: MARKET_RDC.country, city: MARKET_RDC.coverageLabel, timestamp: new Date().toISOString(), database: dbOk ? 'connected' : 'disconnected' };
  }
}
