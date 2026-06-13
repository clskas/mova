import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GeoService } from './geo.service';

@ApiTags('geo')
@Controller('geo')
export class GeoController {
  constructor(private geo: GeoService) {}

  @Get('communes')
  @ApiOperation({ summary: 'Quartiers/communes par ville' })
  communes(@Query('city') city?: string) {
    return this.geo.getCommunes(city);
  }

  @Get('service-areas')
  @ApiOperation({ summary: 'Zones de service MOVA (villes RDC)' })
  serviceAreas() {
    return this.geo.listServiceAreas();
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Autocomplétion adresses par ville (communes + Mapbox)' })
  autocomplete(@Query('q') query?: string, @Query('city') city?: string) {
    return this.geo.autocomplete(query ?? '', city);
  }
}
