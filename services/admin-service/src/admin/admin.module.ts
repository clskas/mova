import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { FraudService } from './fraud.service';
import { OpsService } from './ops.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, FraudService, OpsService],
})
export class AdminModule {}
