import { Module } from '@nestjs/common';
import { RidesModule } from '../rides/rides.module';
import { CarpoolController } from './carpool.controller';
import { CarpoolService } from './carpool.service';

@Module({ imports: [RidesModule], controllers: [CarpoolController], providers: [CarpoolService], exports: [CarpoolService] })
export class CarpoolModule {}
