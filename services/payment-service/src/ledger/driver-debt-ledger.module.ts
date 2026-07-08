import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { DriverDebtLedgerService } from './driver-debt-ledger.service';

@Module({
  imports: [WalletModule],
  providers: [DriverDebtLedgerService],
  exports: [DriverDebtLedgerService],
})
export class DriverDebtLedgerModule {}
