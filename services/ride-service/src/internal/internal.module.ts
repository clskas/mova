import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { RidesModule } from '../rides/rides.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';

@Module({ imports: [RidesModule, DeliveriesModule], controllers: [InternalController] })
export class InternalModule {}
