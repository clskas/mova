import { Module } from '@nestjs/common';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { RidesModule } from '../rides/rides.module';

@Module({ imports: [RidesModule], controllers: [DeliveriesController], providers: [DeliveriesService], exports: [DeliveriesService] })
export class DeliveriesModule {}
