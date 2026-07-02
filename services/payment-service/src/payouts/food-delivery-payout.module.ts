import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { DriverPayoutModule } from './driver-payout.module';
import { FoodDeliveryPayoutService } from './food-delivery-payout.service';

@Module({
  imports: [WalletModule, DriverPayoutModule],
  providers: [FoodDeliveryPayoutService],
  exports: [FoodDeliveryPayoutService],
})
export class FoodDeliveryPayoutModule {}
