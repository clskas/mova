import { Module } from '@nestjs/common';
import { RidesModule } from '../rides/rides.module';
import { RentalAutoStartScheduler } from './rental-auto-start.scheduler';
import { RentalController } from './rental.controller';
import { RentalService } from './rental.service';
import { RentalChatService } from '../chat/rental-chat.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [RidesModule, WebsocketModule],
  controllers: [RentalController],
  providers: [RentalService, RentalAutoStartScheduler, RentalChatService],
  exports: [RentalService, RentalChatService],
})
export class RentalModule {}
