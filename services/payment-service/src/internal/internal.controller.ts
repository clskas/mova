import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SubscriptionStatus, SubscriptionTarget } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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
  /** SerdiPay Public API floor — see SERDIPAY_MIN_AMOUNT_CDF (2300). */
  @Type(() => Number) @IsInt() @Min(2300) amountCdf: number;
  @IsString() provider: string;
  @IsString() phone: string;
}

class InternalTopUpDto {
  @Type(() => Number) @IsInt() @Min(2300) amountCdf: number;
  @IsString() provider: string;
  @IsOptional() @IsString() phone?: string;
}

class ReconcileMobileMoneyDto {
  @IsString() providerRef: string;
  @IsEnum(['COMPLETED', 'FAILED']) outcome: 'COMPLETED' | 'FAILED';
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) altRefs?: string[];
  @IsOptional() @Type(() => Number) confirmedAmountCdf?: number;
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

  @Delete('users/:userId/data')
  purgeUserData(@Param('userId') userId: string) {
    return this.wallet.purgeUserData(userId);
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

  @Post('wallets/:userId/top-up')
  topUp(@Param('userId') userId: string, @Body() dto: InternalTopUpDto) {
    return this.wallet.topUp(userId, dto.amountCdf, dto.provider, dto.phone);
  }

  @Get('wallets/:userId/top-up/status')
  topUpStatus(@Param('userId') userId: string, @Query('providerRef') providerRef?: string) {
    return this.wallet.getTopUpStatus(userId, providerRef?.trim() ?? '');
  }

  @Post('wallets/platform/reverse-virtual-float')
  reverseVirtualTreasuryFloat() {
    return this.wallet.reverseVirtualTreasuryFloat();
  }

  @Post('wallets/:userId/withdraw')
  withdraw(@Param('userId') userId: string, @Body() dto: InternalWithdrawDto) {
    return this.wallet.withdrawToMobileMoney(userId, dto.amountCdf, dto.provider, dto.phone, {
      skipOtp: true,
    });
  }

  /**
   * Idempotent ops replay: hub finalize (VPS) and/or wallet/ride/service credit (SENGA).
   * Duplicate COMPLETED → alreadyFinal, no second credit.
   */
  @Post('payments/reconcile-mobile-money')
  reconcileMobileMoney(@Body() dto: ReconcileMobileMoneyDto) {
    return this.payments.completeMobileMoneyFromWebhook(
      dto.providerRef,
      dto.outcome,
      dto.message,
      Array.isArray(dto.altRefs) ? dto.altRefs.filter((r) => typeof r === 'string') : [],
      dto.confirmedAmountCdf,
    );
  }

  @Post('wallets/:userId/reconcile-topup')
  reconcileTopUp(@Param('userId') userId: string, @Body() body: { providerRef?: string }) {
    return this.wallet.reconcileTopUpFromHub(userId, body.providerRef?.trim() ?? '');
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

  @Post('cash-debts/confirm-cash')
  confirmCashDebtByCode(@Body() body: { code: string; confirmedBy?: string }) {
    return this.debtLedger.confirmCashPaymentRequest(body.code, body.confirmedBy);
  }

  @Get('wallets/:userId/transactions')
  searchWalletTransactions(
    @Param('userId') userId: string,
    @Query('descriptionPrefix') descriptionPrefix?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.wallet.searchPartnerTransactions(userId, {
      descriptionPrefix,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      q,
      skip: Number(skip ?? 0),
      take: Number(take ?? 50),
    });
  }

  @Get('debt-policy')
  getDebtPolicy() {
    return this.debtLedger.getPolicy();
  }

  @Patch('debt-policy')
  updateDebtPolicy(@Body() body: { maxOpenDebtCdf?: number; blockOffers?: boolean; isActive?: boolean }) {
    return this.debtLedger.updatePolicy(body);
  }

  @Get('drivers/:userId/debt-status')
  getDriverDebtStatus(@Param('userId') userId: string) {
    return this.debtLedger.getDebtStatus(userId);
  }

  @Post('services/:referenceType/:referenceId/escrow')
  settleEscrow(
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
    @Body()
    body: {
      action: 'RELEASE' | 'REFUND' | 'PARTIAL' | 'FREEZE' | 'RECORD' | 'CREDIT_RESTAURANT';
      userId?: string;
      amountCdf?: number;
      method?: string;
      courierFeeCdf?: number;
      refundCdf?: number;
      reason?: string;
    },
  ) {
    return this.payments.settleEscrow(referenceType, referenceId, body);
  }
}
