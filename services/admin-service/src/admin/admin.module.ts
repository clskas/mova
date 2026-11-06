import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AiInsightsController } from './ai-insights.controller';
import { AiInsightsService } from './ai-insights.service';
import { FraudService } from './fraud.service';
import { OpsService } from './ops.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController, AiInsightsController],
  providers: [AdminService, FraudService, OpsService, AiInsightsService],
})
export class AdminModule {}
