import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsService } from './payments.service';
import { WalletModule } from '../wallet/wallet.module';
import { DriverPayoutModule } from '../payouts/driver-payout.module';
import { FoodDeliveryPayoutModule } from '../payouts/food-delivery-payout.module';
import { DriverDebtLedgerModule } from '../ledger/driver-debt-ledger.module';
import { AirtelMoneyProvider, MockPaymentProvider, MpesaProvider, OrangeMoneyProvider } from './payment-providers';
@Module({
  imports: [WalletModule, DriverPayoutModule, FoodDeliveryPayoutModule, DriverDebtLedgerModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, MockPaymentProvider, OrangeMoneyProvider, MpesaProvider, AirtelMoneyProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
