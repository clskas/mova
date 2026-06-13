import { Module } from '@nestjs/common';
import { ErrandsModule } from '../errands/errands.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { RidesModule } from '../rides/rides.module';

@Module({ imports: [RidesModule, ErrandsModule], controllers: [DeliveriesController], providers: [DeliveriesService], exports: [DeliveriesService] })
export class DeliveriesModule {}
