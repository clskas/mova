import { Controller, Get, HttpStatus, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AdminPermission,
  hasAdminPermission,
  MovaErrorCode,
  MovaHttpException,
} from '@mova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GeoService } from './geo.service';
import { parsePoiCategory } from './poi-category.map';

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
  @ApiOperation({ summary: 'Autocomplétion adresses par ville (communes + POI + Mapbox Search Box / OSM)' })
  autocomplete(
    @Query('q') query?: string,
    @Query('city') city?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('category') category?: string,
  ) {
    const latN = lat != null ? parseFloat(lat) : NaN;
    const lngN = lng != null ? parseFloat(lng) : NaN;
    const near =
      Number.isFinite(latN) && Number.isFinite(lngN) ? { lat: latN, lng: lngN } : undefined;
    return this.geo.autocomplete(query ?? '', city, near, parsePoiCategory(category));
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
    @Query('category') category?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    return this.geo.listPlaces({
      city,
      category: parsePoiCategory(category),
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      radiusKm: radiusKm ? parseFloat(radiusKm) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('places/import')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import POI RDC (admin) — seed national ou Overpass par zone SENGA' })
  importPlaces(
    @Request() req: { user?: { role?: string } },
    @Query('city') city?: string,
    @Query('overpass') overpass?: string,
  ) {
    const role = req.user?.role ?? '';
    if (!hasAdminPermission(role, AdminPermission.PRICING_WRITE)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return this.geo.importPois(city ?? 'RDC', overpass === 'true');
  }
}
