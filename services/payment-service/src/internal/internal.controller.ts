import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SubscriptionStatus, SubscriptionTarget } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { InternalApiGuard } from '../common/internal-api.guard';
import { WalletService } from '../wallet/wallet.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { DriverPayoutService } from '../payouts/driver-payout.service';

class CreateWalletDto {
  @IsString() userId: string;
}

class CreatePlanDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsEnum(SubscriptionTarget) target: SubscriptionTarget;
  @IsInt() @Min(0) monthlyPriceCdf: number;
  @IsOptional() @Min(0) feeReductionPercent?: number;
  @IsOptional() @IsBoolean() priorityMatching?: boolean;
  @IsOptional() @IsString() description?: string;
}

class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) monthlyPriceCdf?: number;
  @IsOptional() @Min(0) feeReductionPercent?: number;
  @IsOptional() @IsBoolean() priorityMatching?: boolean;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class AdminAdjustDto {
  @Type(() => Number) @IsNumber() amountCdf: number;
  @IsEnum(['CREDIT', 'DEBIT']) type: 'CREDIT' | 'DEBIT';
  @IsString() description: string;
}

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(
    private wallet: WalletService,
    private subscriptions: SubscriptionsService,
    private driverPayouts: DriverPayoutService,
  ) {}

  @Post('wallets')
  create(@Body() dto: CreateWalletDto) {
    return this.wallet.createWallet(dto.userId);
  }

  @Get('wallets/overview')
  overview() {
    return this.wallet.overview();
  }

  @Get('wallets/:userId')
  getWallet(@Param('userId') userId: string) {
    return this.wallet.getWallet(userId);
  }

  @Get('transactions')
  listTransactions(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('userId') userId?: string,
  ) {
    return this.wallet.listTransactionsAdmin(Number(skip ?? 0), Number(take ?? 50), userId);
  }

  @Post('wallets/:userId/adjust')
  adjust(@Param('userId') userId: string, @Body() dto: AdminAdjustDto) {
    return this.wallet.adminAdjust(userId, dto.amountCdf, dto.type, dto.description);
  }

  @Post('driver-payouts/sync/:userId')
  syncDriverPayouts(@Param('userId') userId: string) {
    return this.driverPayouts.syncDriverPayouts(userId);
  }

  @Get('subscription-plans')
  listPlans(@Query('activeOnly') activeOnly?: string) {
    return this.subscriptions.listPlans(activeOnly === 'true');
  }

  @Post('subscription-plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.subscriptions.createPlan(dto);
  }

  @Patch('subscription-plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.subscriptions.updatePlan(id, dto);
  }

  @Get('subscriptions')
  listSubscribers(
    @Query('planId') planId?: string,
    @Query('status') status?: SubscriptionStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.subscriptions.listSubscribers({
      planId,
      status,
      skip: Number(skip ?? 0),
      take: Number(take ?? 50),
    });
  }
}
