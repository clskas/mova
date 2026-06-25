import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { WalletModule } from '../wallet/wallet.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DriverPayoutModule } from '../payouts/driver-payout.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [WalletModule, SubscriptionsModule, DriverPayoutModule, PaymentsModule],
  controllers: [InternalController],
})
export class InternalModule {}
