import { FaceCheckService } from './face-check.service';
import { DocExpiryScheduler } from './doc-expiry.scheduler';
import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { OcrModule } from '../ocr/ocr.module';
import { MatchingConfigService } from '../common/matching-config.service';
import { SmileIdModule } from '../smile-id/smile-id.module';

@Module({
  imports: [OcrModule, SmileIdModule],
  controllers: [DriversController],
  providers: [DriversService, MatchingConfigService, DocExpiryScheduler, FaceCheckService],
  exports: [FaceCheckService, DriversService],
})
export class DriversModule {}
