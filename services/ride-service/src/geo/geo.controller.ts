import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GeoService } from './geo.service';
@ApiTags('geo')
@Controller('geo')
export class GeoController {
  constructor(private geo: GeoService) {}
  @Get('communes') @ApiOperation({ summary: 'Communes Kinshasa' }) communes(@Query('city') city?: string) { return this.geo.getCommunes(city); }
}
