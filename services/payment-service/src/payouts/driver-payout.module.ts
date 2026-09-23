import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { DriverDebtLedgerModule } from '../ledger/driver-debt-ledger.module';
import { DriverPayoutService } from './driver-payout.service';

@Module({
  imports: [WalletModule, DriverDebtLedgerModule],
  providers: [DriverPayoutService],
  exports: [DriverPayoutService],
})
export class DriverPayoutModule {}
