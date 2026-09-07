import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PartnerKycService } from './partner-kyc.service';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [PartnerKycService],
  exports: [PartnerKycService],
})
export class PartnerKycModule {}
