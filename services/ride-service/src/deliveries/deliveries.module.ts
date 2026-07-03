import { Module } from '@nestjs/common';
import { ErrandsModule } from '../errands/errands.module';
import { TrackingModule } from '../tracking/tracking.module';
import { MatchingModule } from '../matching/matching.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { RidesModule } from '../rides/rides.module';
import { DeliveryChatService } from '../chat/delivery-chat.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [RidesModule, ErrandsModule, TrackingModule, MatchingModule, WebsocketModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, DeliveryChatService],
  exports: [DeliveriesService, DeliveryChatService],
})
export class DeliveriesModule {}
