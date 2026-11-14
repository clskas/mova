import { ReferralService } from './referral.service';
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
@Module({ controllers: [UsersController], providers: [UsersService, ReferralService], exports: [UsersService, ReferralService] })
export class UsersModule {}
