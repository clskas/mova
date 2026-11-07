import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { DriversModule } from '../drivers/drivers.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { SmileIdModule } from '../smile-id/smile-id.module';
@Module({ imports: [DriversModule, IncidentsModule, SmileIdModule], controllers: [InternalController] })
export class InternalModule {}
