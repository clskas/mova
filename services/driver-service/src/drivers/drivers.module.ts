import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { OcrModule } from '../ocr/ocr.module';
import { MatchingConfigService } from '../common/matching-config.service';

@Module({
  imports: [OcrModule],
  controllers: [DriversController],
  providers: [DriversService, MatchingConfigService],
  exports: [DriversService],
})
export class DriversModule {}
