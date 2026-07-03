import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PromoModule } from '../promo/promo.module';
import { RentalModule } from '../rental/rental.module';
import { UploadsModule } from '../uploads/uploads.module';
import { BillingModule } from '../billing/billing.module';
import { RentalPartnerPortalController } from './rental-partner-portal.controller';
import { RentalPartnerPortalService } from './rental-partner-portal.service';
import { RentalPartnerRoleGuard } from './rental-partner-role.guard';

@Module({
  imports: [AuthModule, RentalModule, UploadsModule, PromoModule, BillingModule],
  controllers: [RentalPartnerPortalController],
  providers: [RentalPartnerPortalService, RentalPartnerRoleGuard],
})
export class RentalPartnerModule {}
