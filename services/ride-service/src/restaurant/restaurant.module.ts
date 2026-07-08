import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';
import { MatchingModule } from '../matching/matching.module';
import { PromoModule } from '../promo/promo.module';
import { BillingModule } from '../billing/billing.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { RestaurantPortalController } from './restaurant-portal.controller';
import { RestaurantPortalService } from './restaurant-portal.service';
import { RestaurantRoleGuard } from './restaurant-role.guard';

@Module({
  imports: [AuthModule, UploadsModule, MatchingModule, PromoModule, BillingModule, DeliveriesModule],
  controllers: [RestaurantPortalController],
  providers: [RestaurantPortalService, RestaurantRoleGuard],
  exports: [RestaurantPortalService],
})
export class RestaurantModule {}
