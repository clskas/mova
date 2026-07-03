import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ErrandsModule } from '../errands/errands.module';
import { InternalModule } from '../internal/internal.module';
import { RidesModule } from '../rides/rides.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { RentalModule } from '../rental/rental.module';
import { HistoryModule } from '../history/history.module';
import { BillingController } from './billing.controller';
import { BillingReceiptService } from './billing-receipt.service';
import { BillingHistoryService, PartnerBillingService } from './partner-billing.service';

@Module({
  imports: [AuthModule, InternalModule, RidesModule, ErrandsModule, DeliveriesModule, RentalModule, HistoryModule],
  controllers: [BillingController],
  providers: [BillingReceiptService, BillingHistoryService, PartnerBillingService],
  exports: [BillingReceiptService, BillingHistoryService, PartnerBillingService],
})
export class BillingModule {}
