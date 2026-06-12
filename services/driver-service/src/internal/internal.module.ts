import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { DriversModule } from '../drivers/drivers.module';
import { IncidentsModule } from '../incidents/incidents.module';
@Module({ imports: [DriversModule, IncidentsModule], controllers: [InternalController] })
export class InternalModule {}
