import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { DriverPayoutModule } from './driver-payout.module';
import { DriverDebtLedgerModule } from '../ledger/driver-debt-ledger.module';
import { RentalPayoutService } from './rental-payout.service';

@Module({
  imports: [WalletModule, DriverPayoutModule, DriverDebtLedgerModule],
  providers: [RentalPayoutService],
  exports: [RentalPayoutService],
})
export class RentalPayoutModule {}
