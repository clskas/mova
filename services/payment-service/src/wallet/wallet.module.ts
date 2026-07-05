import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletSeedService } from './wallet-seed.service';

@Module({
  controllers: [WalletController],
  providers: [WalletService, WalletSeedService],
  exports: [WalletService],
})
export class WalletModule {}
