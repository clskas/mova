import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicitesService } from './publicites.service';

@ApiTags('publicites')
@Controller('publicites')
export class PublicitesController {
  constructor(private publicites: PublicitesService) {}

  @Get()
  @ApiOperation({ summary: 'Publicités actives (passager / chauffeur)' })
  listActive(@Query('cible') cible?: string) {
    return this.publicites.listActive(cible);
  }
}
