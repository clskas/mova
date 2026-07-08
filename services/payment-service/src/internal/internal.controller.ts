import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SubscriptionStatus, SubscriptionTarget } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { InternalApiGuard } from '../common/internal-api.guard';
import { WalletService } from '../wallet/wallet.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { DriverPayoutService } from '../payouts/driver-payout.service';
import { PaymentsService } from '../payments/payments.service';
import { DriverDebtLedgerService } from '../ledger/driver-debt-ledger.service';

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

class InternalWithdrawDto {
  @Type(() => Number) @IsInt() @Min(500) amountCdf: number;
  @IsString() provider: string;
  @IsString() phone: string;
}

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(
    private wallet: WalletService,
    private subscriptions: SubscriptionsService,
    private driverPayouts: DriverPayoutService,
    private payments: PaymentsService,
    private debtLedger: DriverDebtLedgerService,
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

  @Post('wallets/:userId/withdraw')
  withdraw(@Param('userId') userId: string, @Body() dto: InternalWithdrawDto) {
    return this.wallet.withdrawToMobileMoney(userId, dto.amountCdf, dto.provider, dto.phone);
  }

  @Post('wallets/:userId/hold')
  hold(
    @Param('userId') userId: string,
    @Body() body: { amountCdf: number; referenceType: string; referenceId: string; description?: string },
  ) {
    return this.wallet.holdFunds(userId, body.amountCdf, body.referenceType, body.referenceId, body.description);
  }

  @Post('wallets/:userId/debit')
  debit(
    @Param('userId') userId: string,
    @Body() body: { amountCdf: number; description: string; reference?: string },
  ) {
    return this.wallet.internalDebit(userId, body.amountCdf, body.description, body.reference);
  }

  @Post('wallets/holds/:referenceType/:referenceId/release')
  releaseHold(@Param('referenceType') referenceType: string, @Param('referenceId') referenceId: string) {
    return this.wallet.releaseHold(referenceType, referenceId);
  }

  @Post('wallets/holds/:referenceType/:referenceId/capture')
  captureHold(
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
    @Body() body: { captureAmountCdf?: number },
  ) {
    return this.wallet.captureHold(referenceType, referenceId, body.captureAmountCdf);
  }

  @Post('driver-payouts/sync/:userId')
  syncDriverPayouts(@Param('userId') userId: string) {
    return this.driverPayouts.syncDriverPayouts(userId);
  }

  @Get('rides/:rideId/payment-status')
  getRidePaymentStatus(@Param('rideId') rideId: string) {
    return this.payments.getRidePaymentStatus(rideId);
  }

  @Get('rides/:rideId/payment-detail')
  getRidePaymentDetail(@Param('rideId') rideId: string) {
    return this.payments.getRidePaymentDetail(rideId);
  }

  @Get('services/:referenceType/:referenceId/payment-detail')
  getServicePaymentDetail(
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
  ) {
    return this.payments.getServicePaymentDetail(referenceType, referenceId);
  }

  @Post('rides/payment-status')
  getRidePaymentStatuses(@Body() body: { rideIds?: string[] }) {
    return this.payments.getRidePaymentStatuses(body.rideIds ?? []);
  }

  @Get('services/:referenceType/:referenceId/payment-status')
  getServicePaymentStatus(
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
  ) {
    return this.payments.getServicePaymentStatus(referenceType, referenceId);
  }

  @Post('services/payment-status')
  getServicePaymentStatuses(@Body() body: { referenceType?: string; referenceIds?: string[] }) {
    return this.payments.getServicePaymentStatuses(body.referenceType ?? 'DELIVERY', body.referenceIds ?? []);
  }

  @Post('services/RENTAL/:referenceId/cash/confirm-partner')
  confirmRentalCashByPartner(
    @Param('referenceId') referenceId: string,
    @Body() body: { ownerUserId: string; pin: string },
  ) {
    return this.payments.confirmRentalCashByPartner(referenceId, body.ownerUserId, body.pin);
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

  @Get('drivers/:userId/cash-debts')
  getDriverCashDebts(@Param('userId') userId: string) {
    return this.debtLedger.getSummary(userId);
  }

  @Get('cash-debts')
  listCashDebts(@Query('driverUserId') driverUserId?: string) {
    return this.debtLedger.getAdminOverview(driverUserId);
  }

  @Post('cash-debts/:debtId/settle')
  settleCashDebt(@Param('debtId') debtId: string, @Body() body: { settlementRef?: string }) {
    return this.debtLedger.adminSettleDebt(debtId, body.settlementRef);
  }
}
