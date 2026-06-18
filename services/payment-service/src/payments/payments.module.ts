import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WalletModule } from '../wallet/wallet.module';
import { DriverPayoutModule } from '../payouts/driver-payout.module';
import { AirtelMoneyProvider, MockPaymentProvider, MpesaProvider, OrangeMoneyProvider } from './payment-providers';
@Module({
  imports: [WalletModule, DriverPayoutModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MockPaymentProvider, OrangeMoneyProvider, MpesaProvider, AirtelMoneyProvider],
})
export class PaymentsModule {}
