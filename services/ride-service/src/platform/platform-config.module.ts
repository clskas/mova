import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformConfigService } from './platform-config.service';
import { ParcelWeightBandService } from './parcel-weight-band.service';
import { ClientAppsConfigService } from './client-apps-config.service';
import { PlatformVendorsService } from './platform-vendors.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PlatformConfigService, ParcelWeightBandService, ClientAppsConfigService, PlatformVendorsService],
  exports: [PlatformConfigService, ParcelWeightBandService, ClientAppsConfigService, PlatformVendorsService],
})
export class PlatformConfigModule {}
