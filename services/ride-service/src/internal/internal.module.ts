import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { RidesModule } from '../rides/rides.module';
@Module({ imports: [RidesModule], controllers: [InternalController] })
export class InternalModule {}
