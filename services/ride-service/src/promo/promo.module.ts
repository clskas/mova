import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RidesModule } from '../rides/rides.module';
import { PartnerPromoService } from './partner-promo.service';
import { PromoController } from './promo.controller';

@Module({
  imports: [RidesModule, PrismaModule],
  controllers: [PromoController],
  providers: [PartnerPromoService],
  exports: [PartnerPromoService],
})
export class PromoModule {}
