import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { WalletModule } from '../wallet/wallet.module';
@Module({ imports: [WalletModule], controllers: [InternalController] })
export class InternalModule {}
