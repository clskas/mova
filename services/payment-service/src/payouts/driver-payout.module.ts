import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { DriverPayoutService } from './driver-payout.service';

@Module({
  imports: [WalletModule],
  providers: [DriverPayoutService],
  exports: [DriverPayoutService],
})
export class DriverPayoutModule {}
