import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { MatchingModule } from '../matching/matching.module';
import { RidesModule } from '../rides/rides.module';
import { TrackingModule } from '../tracking/tracking.module';
import { ShareModule } from '../share/share.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ErrandChatService } from '../chat/errand-chat.service';
import { ErrandsController } from './errands.controller';
import { ErrandsService } from './errands.service';

@Module({
  imports: [GeoModule, RidesModule, TrackingModule, ShareModule, MatchingModule, WebsocketModule],
  controllers: [ErrandsController],
  providers: [ErrandsService, ErrandChatService],
  exports: [ErrandsService, ErrandChatService],
})
export class ErrandsModule {}
