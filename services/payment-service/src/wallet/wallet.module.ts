import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletSeedService } from './wallet-seed.service';
import { TestVoidService } from './test-void.service';

@Module({
  controllers: [WalletController],
  providers: [WalletService, WalletSeedService, TestVoidService],
  exports: [WalletService, TestVoidService],
})
export class WalletModule {}
