import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { CityActivationService } from './city-activation.service';
import { GeocodeProvider } from './geocode.provider';
import { MapboxService } from './mapbox.service';
import { NominatimService } from './nominatim.service';
import { PhotonService } from './photon.service';
import { PoiImportService } from './poi-import.service';
import { PoiSuggestionsController } from './poi-suggestions.controller';
import { PoiSuggestionsService } from './poi-suggestions.service';
import { RoutingService } from './routing.service';

@Module({
  controllers: [GeoController, PoiSuggestionsController],
  providers: [
    GeoService,
    CityActivationService,
    PoiImportService,
    RoutingService,
    MapboxService,
    NominatimService,
    PhotonService,
    GeocodeProvider,
    PoiSuggestionsService,
  ],
  exports: [
    GeoService,
    CityActivationService,
    PoiImportService,
    RoutingService,
    MapboxService,
    NominatimService,
    PhotonService,
    GeocodeProvider,
    PoiSuggestionsService,
  ],
})
export class GeoModule {}
