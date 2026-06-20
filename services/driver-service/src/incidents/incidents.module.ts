import { Module } from '@nestjs/common';
import { RedisModule } from '@mova/shared';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
@Module({
  imports: [RedisModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
