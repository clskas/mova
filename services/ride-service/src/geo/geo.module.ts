import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { PoiImportService } from './poi-import.service';

@Module({
  controllers: [GeoController],
  providers: [GeoService, PoiImportService],
  exports: [GeoService, PoiImportService],
})
export class GeoModule {}
