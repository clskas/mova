import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { NominatimService } from './nominatim.service';
import { PoiImportService } from './poi-import.service';
import { PoiSuggestionsController } from './poi-suggestions.controller';
import { PoiSuggestionsService } from './poi-suggestions.service';
import { RoutingService } from './routing.service';

@Module({
  controllers: [GeoController, PoiSuggestionsController],
  providers: [GeoService, PoiImportService, RoutingService, NominatimService, PoiSuggestionsService],
  exports: [GeoService, PoiImportService, RoutingService, NominatimService, PoiSuggestionsService],
})
export class GeoModule {}
