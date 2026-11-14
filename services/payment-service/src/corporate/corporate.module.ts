import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { CorporateService } from './corporate.service';

@Module({
  imports: [WalletModule],
  providers: [CorporateService],
  exports: [CorporateService],
})
export class CorporateModule {}
