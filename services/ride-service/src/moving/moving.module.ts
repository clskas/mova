import { Module } from '@nestjs/common';
import { RidesModule } from '../rides/rides.module';
import { MovingController } from './moving.controller';
import { MovingService } from './moving.service';

@Module({ imports: [RidesModule], controllers: [MovingController], providers: [MovingService], exports: [MovingService] })
export class MovingModule {}
