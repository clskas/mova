import { Module } from '@nestjs/common';
import { AppsRegistry } from './apps.registry';
import { HmacGuard } from './hmac.guard';

@Module({
  providers: [AppsRegistry, HmacGuard],
  exports: [AppsRegistry, HmacGuard],
})
export class HubAuthModule {}
