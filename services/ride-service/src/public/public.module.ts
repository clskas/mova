import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [TrackingModule],
  controllers: [PublicController],
})
export class PublicModule {}
