import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { ExpressController } from './express.controller';

@Module({ imports: [DeliveriesModule], controllers: [ExpressController] })
export class ExpressModule {}
