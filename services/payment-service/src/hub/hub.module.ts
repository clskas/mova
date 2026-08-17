import { Module } from '@nestjs/common';
import { HubAppsRegistry } from './hub-apps.registry';
import { HubHmacGuard } from './hub-hmac.guard';
import { HubPaymentsController } from './hub-payments.controller';
import { HubPaymentsService } from './hub-payments.service';

@Module({
  controllers: [HubPaymentsController],
  providers: [HubAppsRegistry, HubHmacGuard, HubPaymentsService],
  exports: [HubAppsRegistry, HubPaymentsService],
})
export class HubModule {}
