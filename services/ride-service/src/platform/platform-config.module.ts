import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformConfigService } from './platform-config.service';
import { ParcelWeightBandService } from './parcel-weight-band.service';
import { ClientAppsConfigService } from './client-apps-config.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PlatformConfigService, ParcelWeightBandService, ClientAppsConfigService],
  exports: [PlatformConfigService, ParcelWeightBandService, ClientAppsConfigService],
})
export class PlatformConfigModule {}
