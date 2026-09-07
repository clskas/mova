import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { PaymentInfoService } from './payment-info.service';
import { RidesModule } from '../rides/rides.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { ErrandsModule } from '../errands/errands.module';
import { GeoModule } from '../geo/geo.module';
import { CarpoolModule } from '../carpool/carpool.module';
import { MovingModule } from '../moving/moving.module';
import { RentalModule } from '../rental/rental.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingModule } from '../tracking/tracking.module';
import { PublicitesModule } from '../publicites/publicites.module';
import { PartnerKycModule } from '../partner-kyc/partner-kyc.module';
import { CompanyContactsModule } from '../company-contacts/company-contacts.module';

@Module({
  imports: [PrismaModule, RidesModule, DeliveriesModule, ErrandsModule, GeoModule, CarpoolModule, MovingModule, RentalModule, TrackingModule, PublicitesModule, PartnerKycModule, CompanyContactsModule],
  controllers: [InternalController],
  providers: [PaymentInfoService],
  exports: [PaymentInfoService],
})
export class InternalModule {}
