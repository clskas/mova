import { Controller, Get, UseGuards } from '@nestjs/common';
import { integrationEnvPresence } from '@mova/shared';
import { InternalApiGuard } from './common/internal-api.guard';

/** Which external platforms are configured on this server (presence only, never values). */
@Controller('internal/integrations')
@UseGuards(InternalApiGuard)
export class IntegrationsInternalController {
  @Get('env')
  env() {
    return { service: process.env.RENDER_SERVICE_NAME ?? null, present: integrationEnvPresence() };
  }
}
