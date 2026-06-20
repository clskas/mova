import { Module } from '@nestjs/common';
import { TrackingModule } from '../tracking/tracking.module';
import { TrackingGateway } from './tracking.gateway';

@Module({
  imports: [TrackingModule],
  providers: [TrackingGateway],
  exports: [TrackingGateway],
})
export class WebsocketModule {}
