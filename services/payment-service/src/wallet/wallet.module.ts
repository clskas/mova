import { AutoPayoutController, PaymentAutomationsService } from './payment-automations.service';
import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletSeedService } from './wallet-seed.service';
import { TestVoidService } from './test-void.service';

@Module({
  controllers: [AutoPayoutController, WalletController],
  providers: [
    PaymentAutomationsService,WalletService, WalletSeedService, TestVoidService],
  exports: [WalletService, TestVoidService],
})
export class WalletModule {}
