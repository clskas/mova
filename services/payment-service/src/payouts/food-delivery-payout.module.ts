import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { DriverPayoutModule } from './driver-payout.module';
import { DriverDebtLedgerModule } from '../ledger/driver-debt-ledger.module';
import { FoodDeliveryPayoutService } from './food-delivery-payout.service';

@Module({
  imports: [WalletModule, DriverPayoutModule, DriverDebtLedgerModule],
  providers: [FoodDeliveryPayoutService],
  exports: [FoodDeliveryPayoutService],
})
export class FoodDeliveryPayoutModule {}
