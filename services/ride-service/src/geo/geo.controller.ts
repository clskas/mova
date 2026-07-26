import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlaceOfInterestCategory } from '@prisma/client';
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
  @ApiOperation({ summary: 'Zones de service SENGA (villes RDC)' })
  serviceAreas() {
    return this.geo.listServiceAreas();
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Autocomplétion adresses par ville (communes + POI + Nominatim OSM)' })
  autocomplete(@Query('q') query?: string, @Query('city') city?: string) {
    return this.geo.autocomplete(query ?? '', city);
  }

  @Get('reverse')
  @ApiOperation({ summary: 'Reverse geocoding OSM (Nominatim) : coordonnées → adresse' })
  reverse(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    const latN = lat != null ? parseFloat(lat) : NaN;
    const lngN = lng != null ? parseFloat(lng) : NaN;
    return this.geo.reverseGeocode(latN, lngN);
  }

  @Get('places')
  @ApiOperation({ summary: 'Points d\'intérêt (marchés, hôpitaux, universités…)' })
  places(
    @Query('city') city?: string,
    @Query('category') category?: PlaceOfInterestCategory,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    return this.geo.listPlaces({
      city,
      category,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      radiusKm: radiusKm ? parseFloat(radiusKm) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('places/import')
  @ApiOperation({ summary: 'Import POI RDC (seed national ou Overpass par zone SENGA)' })
  importPlaces(@Query('city') city?: string, @Query('overpass') overpass?: string) {
    return this.geo.importPois(city ?? 'RDC', overpass === 'true');
  }
}
