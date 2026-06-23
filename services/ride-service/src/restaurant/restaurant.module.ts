import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';
import { MatchingModule } from '../matching/matching.module';
import { RestaurantPortalController } from './restaurant-portal.controller';
import { RestaurantPortalService } from './restaurant-portal.service';
import { RestaurantRoleGuard } from './restaurant-role.guard';

@Module({
  imports: [AuthModule, UploadsModule, MatchingModule],
  controllers: [RestaurantPortalController],
  providers: [RestaurantPortalService, RestaurantRoleGuard],
  exports: [RestaurantPortalService],
})
export class RestaurantModule {}
