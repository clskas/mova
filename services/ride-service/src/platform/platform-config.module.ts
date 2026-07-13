import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformConfigService } from './platform-config.service';
import { ParcelWeightBandService } from './parcel-weight-band.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PlatformConfigService, ParcelWeightBandService],
  exports: [PlatformConfigService, ParcelWeightBandService],
})
export class PlatformConfigModule {}
