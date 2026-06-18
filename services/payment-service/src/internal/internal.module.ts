import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { WalletModule } from '../wallet/wallet.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DriverPayoutModule } from '../payouts/driver-payout.module';

@Module({ imports: [WalletModule, SubscriptionsModule, DriverPayoutModule], controllers: [InternalController] })
export class InternalModule {}
