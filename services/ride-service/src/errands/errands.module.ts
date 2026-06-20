import { Module } from '@nestjs/common';
import { RidesModule } from '../rides/rides.module';
import { TrackingModule } from '../tracking/tracking.module';
import { ErrandsController } from './errands.controller';
import { ErrandsService } from './errands.service';

@Module({ imports: [RidesModule, TrackingModule], controllers: [ErrandsController], providers: [ErrandsService], exports: [ErrandsService] })
export class ErrandsModule {}
