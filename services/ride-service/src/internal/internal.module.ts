import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { PaymentInfoService } from './payment-info.service';
import { RidesModule } from '../rides/rides.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, RidesModule, DeliveriesModule],
  controllers: [InternalController],
  providers: [PaymentInfoService],
  exports: [PaymentInfoService],
})
export class InternalModule {}
