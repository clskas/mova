import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { WalletModule } from '../wallet/wallet.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({ imports: [WalletModule, SubscriptionsModule], controllers: [InternalController] })
export class InternalModule {}
