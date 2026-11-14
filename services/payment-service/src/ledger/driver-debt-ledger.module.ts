import { CashDebtFollowupScheduler } from './cash-debt-followup.scheduler';
import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { CashVirtualEarningsService } from './cash-virtual-earnings.service';
import { DriverDebtLedgerService } from './driver-debt-ledger.service';

@Module({
  imports: [WalletModule],
  providers: [DriverDebtLedgerService, CashVirtualEarningsService, CashDebtFollowupScheduler],
  exports: [DriverDebtLedgerService, CashVirtualEarningsService],
})
export class DriverDebtLedgerModule {}
