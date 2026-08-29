import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CashDebtCategory, PaymentMethod, PaymentStatus } from '@prisma/client';
import {
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
  PaymentCompletedPayload,
  RideCashPendingPayload,
  INTERNAL_API_KEY,
  fromMobileRideStatus,
  normalizePhoneRdc,
  serviceUrl,
  validatePhoneRdc,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { DriverPayoutService } from '../payouts/driver-payout.service';
import { FoodDeliveryPayoutService } from '../payouts/food-delivery-payout.service';
import { DriverDebtLedgerService } from '../ledger/driver-debt-ledger.service';
import { HubPaymentsService } from '../hub/hub-payments.service';
import { AirtelMoneyProvider, MockPaymentProvider, MpesaProvider, OrangeMoneyProvider, isAsyncMobileMoneyRef } from './payment-providers';
import { PaymentProvider } from './payment-provider.interface';
import { expandProviderRefKeys } from './provider-ref.util';

const MOBILE_MONEY_METHODS = new Set<PaymentMethod>([
  PaymentMethod.ORANGE_MONEY,
  PaymentMethod.MPESA,
  PaymentMethod.AIRTEL_MONEY,
]);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private providers: Map<PaymentMethod, PaymentProvider>;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private walletService: WalletService,
    private driverPayouts: DriverPayoutService,
    private foodPayouts: FoodDeliveryPayoutService,
    private debtLedger: DriverDebtLedgerService,
    private redis: RedisService,
    mock: MockPaymentProvider,
    orange: OrangeMoneyProvider,
    mpesa: MpesaProvider,
    airtel: AirtelMoneyProvider,
    @Optional() private readonly hubPayments?: HubPaymentsService,
  ) {
    this.providers = new Map<PaymentMethod, PaymentProvider>([
      [PaymentMethod.ORANGE_MONEY, orange],
      [PaymentMethod.MPESA, mpesa],
      [PaymentMethod.AIRTEL_MONEY, airtel],
    ]);
    if (config.get('MOCK_PAYMENTS') === 'true') this.providers.set(PaymentMethod.WALLET, mock);
  }

  private getProvider(method: PaymentMethod): PaymentProvider {
    if (this.config.get('NODE_ENV') === 'production' && this.config.get('MOCK_PAYMENTS') === 'true') {
      throw new MovaHttpException(MovaErrorCode.INTERNAL_ERROR, undefined, 'MOCK_PAYMENTS interdit en production.');
    }
    if (method === PaymentMethod.WALLET) return this.providers.get(PaymentMethod.WALLET) ?? new MockPaymentProvider(this.config);
    const provider = this.providers.get(method);
    if (!provider) throw new MovaHttpException(MovaErrorCode.PAYMENT_INVALID_METHOD);
    if (this.config.get('MOCK_PAYMENTS') === 'true') return new MockPaymentProvider(this.config);
    return provider;
  }

  private resolveRideStatus(ride: { status?: string; internalStatus?: string }): string {
    const raw = ride.internalStatus ?? ride.status ?? '';
    try {
      return fromMobileRideStatus(raw);
    } catch {
      return raw;
    }
  }

  private resolvePaymentPhone(method: PaymentMethod, phone?: string): string {
    if (!MOBILE_MONEY_METHODS.has(method)) return phone?.trim() ?? '';
    const normalized = phone?.trim() ? normalizePhoneRdc(phone.trim()) : '';
    if (!normalized) throw new MovaHttpException(MovaErrorCode.PAYMENT_PHONE_REQUIRED);
    if (!validatePhoneRdc(normalized)) throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PHONE);
    return normalized;
  }

  private async fetchRide(rideId: string) {
    try {
      const res = await fetch(serviceUrl('ride', `/internal/rides/${rideId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (res.status === 404) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
      if (!res.ok) {
        this.logger.warn(`fetchRide ${rideId} failed: HTTP ${res.status}`);
        throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.BAD_GATEWAY);
      }
      return res.json();
    } catch (e) {
      if (e instanceof MovaHttpException) throw e;
      this.logger.error(`fetchRide ${rideId} unreachable`, e);
      throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.BAD_GATEWAY);
    }
  }

  private async publishPaymentCompleted(payload: PaymentCompletedPayload) {
    try {
      await this.redis.publish(MOVA_EVENTS.PAYMENT_COMPLETED, payload);
    } catch (e) {
      this.logger.warn(`Redis publish PAYMENT_COMPLETED failed for ride ${payload.rideId}`, e);
    }
  }

  private async publishRideCashPending(payload: RideCashPendingPayload) {
    try {
      this.logger.log(`Publishing RIDE_CASH_PENDING for ride ${payload.rideId} (driver ${payload.driverId ?? 'n/a'})`);
      await this.redis.publish(MOVA_EVENTS.RIDE_CASH_PENDING, payload);
    } catch (e) {
      this.logger.warn(`Redis publish RIDE_CASH_PENDING failed for ride ${payload.rideId}`, e);
    }
  }

  private async publishServiceCashPending(payload: {
    referenceType: string;
    referenceId: string;
    driverId?: string;
    userId?: string;
    amountCdf: number;
  }) {
    try {
      this.logger.log(
        `Publishing SERVICE_CASH_PENDING for ${payload.referenceType}/${payload.referenceId} (driver ${payload.driverId ?? 'n/a'})`,
      );
      await this.redis.publish(MOVA_EVENTS.SERVICE_CASH_PENDING, payload);
    } catch (e) {
      this.logger.warn(
        `Redis publish SERVICE_CASH_PENDING failed for ${payload.referenceType}/${payload.referenceId}`,
        e,
      );
    }
  }

  private async settleDriverPayout(
    referenceType: string,
    referenceId: string,
    driverId: string,
    driverNetCdf: number,
    grossCdf: number,
    paymentMethod: PaymentMethod,
  ) {
    const platformFee = Math.max(0, Math.round((grossCdf ?? driverNetCdf) - driverNetCdf));
    if (paymentMethod !== PaymentMethod.CASH) {
      await this.driverPayouts.creditPayout(driverId, {
        referenceType: referenceType.toUpperCase(),
        referenceId,
        driverNetCdf,
      });
    }
    if (platformFee > 0) {
      await this.walletService.creditPlatformFee(
        platformFee,
        paymentMethod === PaymentMethod.CASH
          ? `Commission espèces ${referenceType} ${referenceId}`
          : `Commission SENGA ${referenceType} ${referenceId}`,
        `PLATFORM_FEE:${referenceType}:${referenceId}`,
      );
    }
    if (paymentMethod === PaymentMethod.CASH && platformFee > 0) {
      await this.debtLedger.recordDebt({
        driverUserId: driverId,
        referenceType,
        referenceId,
        category: CashDebtCategory.PLATFORM_FEE,
        amountCdf: platformFee,
        description: `Commission espèces à reverser — ${referenceType} ${referenceId.slice(0, 8)}`,
      });
    }
  }

  private async creditDriverAfterRidePayment(rideId: string) {
    const payout = await this.driverPayouts.fetchRidePayout(rideId);
    if (!payout?.driverId || payout.driverNetCdf <= 0) return;
    const payment = await this.prisma.payment.findUnique({ where: { rideId } });
    const method = payment?.method ?? PaymentMethod.WALLET;
    await this.settleDriverPayout(
      'RIDE',
      rideId,
      payout.driverId,
      payout.driverNetCdf,
      payout.grossCdf ?? payout.driverNetCdf,
      method,
    );
  }

  private async creditDriverAfterServicePayment(referenceType: string, referenceId: string) {
    const type = referenceType.toUpperCase();
    try {
      if (type === 'RENTAL') {
        await this.syncRentalPaidStatus(referenceId);
      }
      if (type === 'DELIVERY') {
        const foodPayment = await this.prisma.servicePayment.findUnique({
          where: { referenceType_referenceId: { referenceType: type, referenceId } },
        });
        const foodMethod = foodPayment?.method ?? PaymentMethod.WALLET;
        const foodResult = await this.foodPayouts.creditFoodDeliverySettlement(referenceId, foodMethod);
        if (foodResult.handled) return;
      }
      const res = await fetch(
        serviceUrl('ride', `/internal/services/${type}/${referenceId}/payout`),
        { headers: { 'x-internal-api-key': INTERNAL_API_KEY } },
      );
      if (!res.ok) return;
      const payout = (await res.json()) as { driverId?: string; driverNetCdf?: number; grossCdf?: number };
      if (!payout?.driverId || (payout.driverNetCdf ?? 0) <= 0) return;
      const payment = await this.prisma.servicePayment.findUnique({
        where: { referenceType_referenceId: { referenceType: type, referenceId } },
      });
      const method = payment?.method ?? PaymentMethod.WALLET;
      await this.settleDriverPayout(
        type,
        referenceId,
        payout.driverId,
        payout.driverNetCdf ?? 0,
        payout.grossCdf ?? payout.driverNetCdf ?? 0,
        method,
      );
    } catch (e) {
      this.logger.warn(`creditDriverAfterServicePayment ${referenceType}/${referenceId} failed`, e);
    }
  }

  private async syncRentalPaidStatus(referenceId: string) {
    try {
      const res = await fetch(
        serviceUrl('ride', `/internal/rental-inquiries/${referenceId}/mark-paid`),
        { method: 'POST', headers: { 'x-internal-api-key': INTERNAL_API_KEY } },
      );
      if (!res.ok) {
        this.logger.warn(`syncRentalPaidStatus ${referenceId}: HTTP ${res.status}`);
      }
    } catch (e) {
      this.logger.warn(`syncRentalPaidStatus ${referenceId} failed`, e);
    }
  }

  private isAsyncMobileMoney(provider: PaymentProvider, result: { providerRef?: string; pending?: boolean }): boolean {
    if (provider.name === 'MOCK') return false;
    return Boolean(result.pending) || isAsyncMobileMoneyRef(result.providerRef);
  }

  async processPayment(rideId: string, userId: string, amountCdf: number, method: PaymentMethod, phone: string) {
    const provider = this.getProvider(method);
    const result = await provider.initiatePayment(amountCdf, phone, rideId);
    if (!result.success) {
      const payment = await this.prisma.payment.upsert({
        where: { rideId },
        create: {
          rideId,
          userId,
          amountCdf,
          method,
          status: PaymentStatus.FAILED,
          providerRef: result.providerRef,
          failureReason: result.message,
        },
        update: {
          status: PaymentStatus.FAILED,
          providerRef: result.providerRef,
          failureReason: result.message,
        },
      });
      throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, undefined, result.message);
    }

    const asyncMm = this.isAsyncMobileMoney(provider, result);
    const status = asyncMm ? PaymentStatus.PENDING : PaymentStatus.COMPLETED;
    const payment = await this.prisma.payment.upsert({
      where: { rideId },
      create: {
        rideId,
        userId,
        amountCdf,
        method,
        status,
        providerRef: result.providerRef,
        failureReason: null,
      },
      update: {
        status,
        method,
        amountCdf,
        providerRef: result.providerRef,
        failureReason: null,
      },
    });

    if (asyncMm) {
      return {
        success: true,
        pendingMobileMoney: true,
        payment,
        providerRef: result.providerRef,
        message: result.message ?? 'Confirmez le paiement sur votre téléphone Mobile Money.',
      };
    }

    await this.publishPaymentCompleted({ rideId, userId, amountCdf, method } as PaymentCompletedPayload);
    await this.creditDriverAfterRidePayment(rideId);
    return { success: true, payment, message: result.message ?? 'Paiement effectué' };
  }

  async payRide(rideId: string, userId: string, method: PaymentMethod, phone?: string, amountOverride?: number) {
    const ride = await this.fetchRide(rideId);
    if (ride.passengerId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (this.resolveRideStatus(ride) !== 'COMPLETED') {
      throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    }
    // Idempotence : ne jamais rétrograder un paiement déjà réglé (ex. cash confirmé
    // par le chauffeur) en re-créant un PENDING lors d'un double clic « Payer ».
    const existingPayment = await this.prisma.payment.findUnique({ where: { rideId } });
    if (existingPayment?.status === PaymentStatus.COMPLETED) {
      return { success: true, payment: existingPayment, alreadyPaid: true, message: 'Course déjà payée' };
    }
    if (
      existingPayment?.status === PaymentStatus.PENDING &&
      MOBILE_MONEY_METHODS.has(existingPayment.method) &&
      MOBILE_MONEY_METHODS.has(method)
    ) {
      return {
        success: true,
        pendingMobileMoney: true,
        payment: existingPayment,
        providerRef: existingPayment.providerRef,
        message: 'Paiement Mobile Money déjà en cours — confirmez sur votre téléphone.',
      };
    }
    const amountCdf = amountOverride ?? ride.finalFareCdf ?? ride.estimatedFareCdf ?? ride.priceCdf ?? 0;
    if (amountCdf <= 0) throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED);
    const paymentPhone = this.resolvePaymentPhone(method, phone);

    if (method === PaymentMethod.WALLET) {
      await this.walletService.debit(userId, amountCdf, `Paiement course ${rideId}`, `RIDE:${rideId}`);
      const payment = await this.prisma.payment.upsert({
        where: { rideId },
        create: { rideId, userId, amountCdf, method, status: PaymentStatus.COMPLETED, providerRef: `wallet_${rideId}` },
        update: { status: PaymentStatus.COMPLETED, method, amountCdf },
      });
      await this.publishPaymentCompleted({ rideId, userId, amountCdf, method: method.toString() });
      await this.creditDriverAfterRidePayment(rideId);
      return { success: true, payment, message: 'Paiement portefeuille effectué' };
    }
    if (method === PaymentMethod.CASH) {
      const payment = await this.prisma.payment.upsert({
        where: { rideId },
        create: { rideId, userId, amountCdf, method, status: PaymentStatus.PENDING, providerRef: `cash_pending_${rideId}` },
        update: { status: PaymentStatus.PENDING, method, amountCdf },
      });
      // Notifie le chauffeur en temps réel pour ouvrir automatiquement la
      // confirmation du PIN espèces (relayé par ride-service au socket).
      await this.publishRideCashPending({
        rideId,
        driverId: ride.driverId ?? undefined,
        passengerId: ride.passengerId ?? undefined,
        amountCdf,
      });
      return {
        success: true,
        payment,
        pendingCash: true,
        message: 'Paiement espèces en attente — communiquez le code PIN au chauffeur.',
      };
    }
    return this.processPayment(rideId, userId, amountCdf, method, paymentPhone);
  }

  private async fetchServicePaymentInfo(referenceType: string, referenceId: string) {
    try {
      const res = await fetch(
        serviceUrl('ride', `/internal/services/${referenceType}/${referenceId}/payment-info`),
        { headers: { 'x-internal-api-key': INTERNAL_API_KEY } },
      );
      if (res.status === 404) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      if (!res.ok) {
        this.logger.warn(`fetchServicePaymentInfo ${referenceType}/${referenceId} failed: HTTP ${res.status}`);
        throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.BAD_GATEWAY);
      }
      return res.json() as Promise<{
        userId: string;
        amountCdf: number;
        paymentReady: boolean;
        status?: string;
        referenceType: string;
        referenceId: string;
        title?: string;
        driverId?: string | null;
        ownerUserId?: string | null;
        cashPin?: string | null;
      }>;
    } catch (e) {
      if (e instanceof MovaHttpException) throw e;
      this.logger.error(`fetchServicePaymentInfo ${referenceType}/${referenceId} unreachable`, e);
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.BAD_GATEWAY);
    }
  }

  private servicePaymentNotReadyMessage(type: string, status?: string): string {
    if (type === 'RENTAL') {
      if (status && status !== 'RETURNED' && status !== 'PAID') {
        return 'Le paiement sera disponible après le retour du véhicule. Demandez au partenaire de cliquer « Véhicule rendu » dans le portail location.';
      }
      return 'La location n\'est pas encore prête pour le paiement.';
    }
    return 'Le service n\'est pas prêt pour le paiement.';
  }

  async getServicePaymentPreview(referenceType: string, referenceId: string, userId: string) {
    const type = referenceType.toUpperCase();
    const info = await this.fetchServicePaymentInfo(type, referenceId);
    if (info.userId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    return {
      referenceType: type,
      referenceId,
      amountCdf: info.amountCdf,
      paymentReady: info.paymentReady,
      cashPin: info.cashPin ?? null,
      title: info.title ?? null,
    };
  }

  async payService(
    referenceType: string,
    referenceId: string,
    userId: string,
    method: PaymentMethod,
    phone?: string,
    amountOverride?: number,
  ) {
    const type = referenceType.toUpperCase();
    if (type === 'RIDE') return this.payRide(referenceId, userId, method, phone, amountOverride);

    const info = await this.fetchServicePaymentInfo(type, referenceId);
    if (info.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (!info.paymentReady) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        this.servicePaymentNotReadyMessage(type, info.status),
      );
    }
    const amountCdf = amountOverride ?? info.amountCdf;
    if (amountCdf <= 0) throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED);
    const paymentPhone = this.resolvePaymentPhone(method, phone);
    const refKey = `${type}:${referenceId}`;

    const existingServicePayment = await this.prisma.servicePayment.findUnique({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
    });
    if (existingServicePayment?.status === PaymentStatus.COMPLETED) {
      return {
        success: true,
        payment: existingServicePayment,
        alreadyPaid: true,
        message: 'Service déjà payé',
        amountCdf,
        currency: 'CDF',
      };
    }
    if (
      existingServicePayment?.status === PaymentStatus.PENDING &&
      MOBILE_MONEY_METHODS.has(existingServicePayment.method) &&
      MOBILE_MONEY_METHODS.has(method)
    ) {
      return {
        success: true,
        pendingMobileMoney: true,
        payment: existingServicePayment,
        providerRef: existingServicePayment.providerRef,
        message: 'Paiement Mobile Money déjà en cours — confirmez sur votre téléphone.',
        amountCdf,
        currency: 'CDF',
      };
    }

    if (method === PaymentMethod.WALLET) {
      await this.walletService.debit(userId, amountCdf, `Paiement ${type} ${referenceId}`, refKey);
      const payment = await this.prisma.servicePayment.upsert({
        where: { referenceType_referenceId: { referenceType: type, referenceId } },
        create: { referenceType: type, referenceId, userId, amountCdf, method, status: PaymentStatus.COMPLETED, providerRef: `wallet_${refKey}` },
        update: { status: PaymentStatus.COMPLETED, method, amountCdf },
      });
      await this.publishPaymentCompleted({ referenceType: type, referenceId, userId, amountCdf, method: method.toString() });
      await this.creditDriverAfterServicePayment(type, referenceId);
      return { success: true, payment, message: 'Paiement portefeuille effectué', amountCdf, currency: 'CDF' };
    }
    if (method === PaymentMethod.CASH) {
      const payment = await this.prisma.servicePayment.upsert({
        where: { referenceType_referenceId: { referenceType: type, referenceId } },
        create: { referenceType: type, referenceId, userId, amountCdf, method, status: PaymentStatus.PENDING, providerRef: `cash_pending_${refKey}` },
        update: { status: PaymentStatus.PENDING, method, amountCdf },
      });
      await this.publishServiceCashPending({
        referenceType: type,
        referenceId,
        driverId: info.driverId ?? undefined,
        userId,
        amountCdf,
      });
      return { success: true, payment, pendingCash: true, message: 'Paiement espèces en attente — communiquez le code PIN au livreur.', amountCdf, currency: 'CDF' };
    }

    const provider = this.getProvider(method);
    const result = await provider.initiatePayment(amountCdf, paymentPhone, refKey);
    if (!result.success) {
      await this.prisma.servicePayment.upsert({
        where: { referenceType_referenceId: { referenceType: type, referenceId } },
        create: {
          referenceType: type,
          referenceId,
          userId,
          amountCdf,
          method,
          status: PaymentStatus.FAILED,
          providerRef: result.providerRef,
          failureReason: result.message,
        },
        update: {
          status: PaymentStatus.FAILED,
          providerRef: result.providerRef,
          failureReason: result.message,
        },
      });
      throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, undefined, result.message);
    }

    const asyncMm = this.isAsyncMobileMoney(provider, result);
    const status = asyncMm ? PaymentStatus.PENDING : PaymentStatus.COMPLETED;
    const payment = await this.prisma.servicePayment.upsert({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
      create: {
        referenceType: type,
        referenceId,
        userId,
        amountCdf,
        method,
        status,
        providerRef: result.providerRef,
        failureReason: null,
      },
      update: {
        status,
        method,
        amountCdf,
        providerRef: result.providerRef,
        failureReason: null,
      },
    });

    if (asyncMm) {
      return {
        success: true,
        pendingMobileMoney: true,
        payment,
        providerRef: result.providerRef,
        message: result.message ?? 'Confirmez le paiement sur votre téléphone Mobile Money.',
        amountCdf,
        currency: 'CDF',
      };
    }

    await this.publishPaymentCompleted({
      referenceType: type,
      referenceId,
      userId,
      amountCdf,
      method: method.toString(),
    });
    await this.creditDriverAfterServicePayment(type, referenceId);
    return { success: true, payment, message: result.message ?? 'Paiement effectué', amountCdf, currency: 'CDF' };
  }

  async confirmCashService(referenceType: string, referenceId: string, driverUserId: string, pin: string) {
    const type = referenceType.toUpperCase();
    if (type === 'RIDE') return this.confirmCashRide(referenceId, driverUserId, pin);

    const info = await this.fetchServicePaymentInfo(type, referenceId);
    const actorAllowed =
      type === 'RENTAL'
        ? [info.driverId, info.ownerUserId].filter(Boolean).includes(driverUserId)
        : info.driverId === driverUserId;
    if (!actorAllowed) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    if (!info.paymentReady) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        this.servicePaymentNotReadyMessage(type, info.status),
      );
    }
    const expectedPin = String(info.cashPin ?? '').trim();
    if (!expectedPin || String(pin).trim() !== expectedPin) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Code PIN incorrect.');
    }
    const existing = await this.prisma.servicePayment.findUnique({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
    });
    if (!existing || existing.method !== PaymentMethod.CASH) {
      throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, undefined, 'Aucun paiement espèces en attente.');
    }
    if (existing.status === PaymentStatus.COMPLETED) {
      return { success: true, payment: existing, message: 'Paiement déjà confirmé' };
    }
    const payment = await this.prisma.servicePayment.update({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
      data: { status: PaymentStatus.COMPLETED, providerRef: `cash_confirmed_${type}:${referenceId}` },
    });
    await this.publishPaymentCompleted({
      referenceType: type,
      referenceId,
      userId: existing.userId,
      amountCdf: existing.amountCdf,
      method: 'CASH',
    });
    await this.creditDriverAfterServicePayment(type, referenceId);
    return { success: true, payment, message: 'Paiement espèces confirmé' };
  }

  /** Confirmation espèces location par le loueur (sans paiement CASH préalable côté passager). */
  async confirmRentalCashByPartner(referenceId: string, ownerUserId: string, pin: string) {
    const type = 'RENTAL';
    const info = await this.fetchServicePaymentInfo(type, referenceId);
    const ownerId = info.ownerUserId ?? info.driverId;
    if (!ownerId || ownerId !== ownerUserId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    if (!info.paymentReady) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        this.servicePaymentNotReadyMessage(type, info.status),
      );
    }
    const expectedPin = String(info.cashPin ?? '').trim();
    if (!expectedPin || String(pin).trim() !== expectedPin) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Code PIN incorrect.');
    }
    const existing = await this.prisma.servicePayment.findUnique({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
    });
    if (existing?.status === PaymentStatus.COMPLETED) {
      await this.syncRentalPaidStatus(referenceId);
      return { success: true, payment: existing, message: 'Paiement déjà confirmé' };
    }
    const refKey = `${type}:${referenceId}`;
    const payment = await this.prisma.servicePayment.upsert({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
      create: {
        referenceType: type,
        referenceId,
        userId: info.userId,
        amountCdf: info.amountCdf,
        method: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        providerRef: `cash_partner_${refKey}`,
      },
      update: {
        status: PaymentStatus.COMPLETED,
        method: PaymentMethod.CASH,
        amountCdf: info.amountCdf,
        providerRef: `cash_partner_${refKey}`,
      },
    });
    await this.publishPaymentCompleted({
      referenceType: type,
      referenceId,
      userId: info.userId,
      amountCdf: info.amountCdf,
      method: 'CASH',
    });
    await this.creditDriverAfterServicePayment(type, referenceId);
    await this.syncRentalPaidStatus(referenceId);
    return { success: true, payment, message: 'Paiement espèces confirmé' };
  }

  async confirmCashRide(rideId: string, driverUserId: string, pin: string) {
    const ride = await this.fetchRide(rideId);
    if (ride.driverId !== driverUserId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    if (this.resolveRideStatus(ride) !== 'COMPLETED') {
      throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    }
    const expectedPin = String(ride.completionPin ?? '').trim();
    if (!expectedPin || String(pin).trim() !== expectedPin) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Code PIN incorrect.');
    }
    const existing = await this.prisma.payment.findUnique({ where: { rideId } });
    if (!existing || existing.method !== PaymentMethod.CASH) {
      throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, undefined, 'Aucun paiement espèces en attente.');
    }
    if (existing.status === PaymentStatus.COMPLETED) {
      return { success: true, payment: existing, message: 'Paiement déjà confirmé' };
    }
    const payment = await this.prisma.payment.update({
      where: { rideId },
      data: { status: PaymentStatus.COMPLETED, providerRef: `cash_confirmed_${rideId}` },
    });
    await this.publishPaymentCompleted({
      rideId,
      userId: existing.userId,
      amountCdf: existing.amountCdf,
      method: 'CASH',
    });
    await this.creditDriverAfterRidePayment(rideId);
    return { success: true, payment, message: 'Paiement espèces confirmé' };
  }

  async getRidePaymentStatus(rideId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { rideId } });
    const isPaid = payment?.status === PaymentStatus.COMPLETED;
    return {
      rideId,
      isPaid,
      paymentStatus: payment?.status ?? null,
    };
  }

  async getRidePaymentStatuses(rideIds: string[]) {
    const unique = [...new Set(rideIds.filter(Boolean))];
    const payments = await this.prisma.payment.findMany({
      where: { rideId: { in: unique } },
    });
    const byRide = new Map(payments.map((p) => [p.rideId, p]));
    const result: Record<string, { rideId: string; isPaid: boolean; paymentStatus: string | null }> = {};
    for (const rideId of unique) {
      const payment = byRide.get(rideId);
      result[rideId] = {
        rideId,
        isPaid: payment?.status === PaymentStatus.COMPLETED,
        paymentStatus: payment?.status ?? null,
      };
    }
    return result;
  }

  async getServicePaymentStatus(referenceType: string, referenceId: string) {
    const type = referenceType.toUpperCase();
    const payment = await this.prisma.servicePayment.findUnique({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
    });
    const isPaid = payment?.status === PaymentStatus.COMPLETED;
    return {
      referenceType: type,
      referenceId,
      isPaid,
      paymentStatus: payment?.status ?? null,
      paymentMethod: payment?.method ?? null,
    };
  }

  async getServicePaymentStatuses(referenceType: string, referenceIds: string[]) {
    const type = referenceType.toUpperCase();
    const unique = [...new Set(referenceIds.filter(Boolean))];
    const payments = await this.prisma.servicePayment.findMany({
      where: { referenceType: type, referenceId: { in: unique } },
    });
    const byId = new Map(payments.map((p) => [p.referenceId, p]));
    const result: Record<
      string,
      { referenceType: string; referenceId: string; isPaid: boolean; paymentStatus: string | null; paymentMethod: string | null }
    > = {};
    for (const referenceId of unique) {
      const payment = byId.get(referenceId);
      result[referenceId] = {
        referenceType: type,
        referenceId,
        isPaid: payment?.status === PaymentStatus.COMPLETED,
        paymentStatus: payment?.status ?? null,
        paymentMethod: payment?.method ?? null,
      };
    }
    return result;
  }

  private formatPaymentDetail(payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    amountCdf: number;
    providerRef: string | null;
    updatedAt: Date;
  }) {
    return {
      method: payment.method,
      status: payment.status,
      amountCdf: payment.amountCdf,
      providerRef: payment.providerRef,
      paidAt: payment.status === PaymentStatus.COMPLETED ? payment.updatedAt.toISOString() : null,
    };
  }

  async getRidePaymentDetail(rideId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { rideId } });
    if (!payment) return null;
    return this.formatPaymentDetail(payment);
  }

  async getServicePaymentDetail(referenceType: string, referenceId: string) {
    const type = referenceType.toUpperCase();
    const payment = await this.prisma.servicePayment.findUnique({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
    });
    if (!payment) return null;
    return this.formatPaymentDetail(payment);
  }

  async findPassengerUnpaidRide(passengerId: string) {
    try {
      const res = await fetch(serviceUrl('ride', `/internal/passengers/${passengerId}/unpaid-ride`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { ride: Record<string, unknown> | null };
      return data.ride;
    } catch {
      return null;
    }
  }

  /** Paiements espèces en attente de confirmation PIN (chauffeur) — courses et services. */
  async findDriverPendingCashRide(driverUserId: string) {
    const ridePending = await this.prisma.payment.findMany({
      where: { method: PaymentMethod.CASH, status: PaymentStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });
    for (const payment of ridePending) {
      const rideId = payment.rideId;
      if (!rideId) continue;
      try {
        const ride = await this.fetchRide(rideId);
        if (ride.driverId !== driverUserId) continue;
        if (this.resolveRideStatus(ride) !== 'COMPLETED') continue;
        return {
          rideId,
          referenceType: 'RIDE',
          referenceId: rideId,
          pendingCash: true,
          paymentMethod: 'CASH',
          amountCdf: payment.amountCdf,
          ride: {
            id: rideId,
            status: 'COMPLETED',
            pickupAddress: ride.pickupAddress,
            dropoffAddress: ride.dropoffAddress,
            priceCdf: ride.finalFareCdf ?? ride.estimatedFareCdf ?? ride.priceCdf ?? payment.amountCdf,
            isPaid: false,
            paymentStatus: payment.status,
          },
        };
      } catch {
        continue;
      }
    }

    const servicePending = await this.prisma.servicePayment.findMany({
      where: { method: PaymentMethod.CASH, status: PaymentStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });
    for (const payment of servicePending) {
      try {
        const info = await this.fetchServicePaymentInfo(payment.referenceType, payment.referenceId);
        if (info.driverId !== driverUserId) continue;
        return {
          referenceType: payment.referenceType,
          referenceId: payment.referenceId,
          pendingCash: true,
          paymentMethod: 'CASH',
          amountCdf: payment.amountCdf,
          service: {
            id: payment.referenceId,
            type: payment.referenceType,
            title: info.title ?? payment.referenceType,
            amountCdf: payment.amountCdf,
            isPaid: false,
            paymentStatus: payment.status,
          },
        };
      } catch {
        continue;
      }
    }

    return { ride: null, pendingCash: false };
  }

  getDriverCashDebtSummary(driverUserId: string) {
    return this.debtLedger.getSummary(driverUserId);
  }

  settleDriverCashDebtFromWallet(driverUserId: string) {
    return this.debtLedger.settleFromWallet(driverUserId);
  }

  createCashDebtCashRequest(driverUserId: string) {
    return this.debtLedger.createCashPaymentRequest(driverUserId);
  }

  getActiveCashDebtCashRequest(driverUserId: string) {
    return this.debtLedger.getActiveCashPaymentRequest(driverUserId);
  }

  getCashDebtCashRequestStatus(driverUserId: string, requestId: string) {
    return this.debtLedger.getCashPaymentRequestStatus(driverUserId, requestId);
  }

  /**
   * Webhook / poll completion for async Mobile Money (SerdiPay / Africa's Talking).
   * Idempotent: already COMPLETED/FAILED returns without side effects.
   */
  async completeMobileMoneyFromWebhook(
    providerRef: string,
    outcome: 'COMPLETED' | 'FAILED',
    message?: string,
    altRefs: string[] = [],
  ) {
    const refs = [
      ...new Set(
        [providerRef, ...altRefs]
          .flatMap((r) => expandProviderRefKeys(r ?? ''))
          .filter(Boolean),
      ),
    ];
    if (refs.length === 0) {
      return { success: false, message: 'providerRef manquant' };
    }

    if (this.hubPayments?.isEnabled()) {
      for (const ref of refs) {
        const hub = await this.hubPayments.finalizeFromAggregator(ref, outcome, message);
        if (hub.found) {
          return { success: true, kind: 'HUB', ...hub };
        }
      }
    }

    const ridePayment = await this.prisma.payment.findFirst({
      where: { providerRef: { in: refs } },
      orderBy: { updatedAt: 'desc' },
    });
    if (ridePayment && MOBILE_MONEY_METHODS.has(ridePayment.method)) {
      if (ridePayment.status === PaymentStatus.COMPLETED || ridePayment.status === PaymentStatus.FAILED) {
        return {
          success: true,
          kind: 'RIDE',
          alreadyFinal: true,
          status: ridePayment.status,
          rideId: ridePayment.rideId,
        };
      }
      if (ridePayment.status !== PaymentStatus.PENDING) {
        return { success: false, message: `Statut course inattendu: ${ridePayment.status}` };
      }
      const payment = await this.prisma.payment.update({
        where: { id: ridePayment.id },
        data: {
          status: outcome === 'COMPLETED' ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
          failureReason: outcome === 'FAILED' ? message ?? 'Paiement Mobile Money refusé' : null,
        },
      });
      if (outcome === 'COMPLETED') {
        await this.publishPaymentCompleted({
          rideId: payment.rideId,
          userId: payment.userId,
          amountCdf: payment.amountCdf,
          method: payment.method,
        } as PaymentCompletedPayload);
        await this.creditDriverAfterRidePayment(payment.rideId);
      }
      return { success: true, kind: 'RIDE', status: payment.status, rideId: payment.rideId };
    }

    const servicePayment = await this.prisma.servicePayment.findFirst({
      where: { providerRef: { in: refs } },
      orderBy: { updatedAt: 'desc' },
    });
    if (servicePayment && MOBILE_MONEY_METHODS.has(servicePayment.method)) {
      if (servicePayment.status === PaymentStatus.COMPLETED || servicePayment.status === PaymentStatus.FAILED) {
        return {
          success: true,
          kind: 'SERVICE',
          alreadyFinal: true,
          status: servicePayment.status,
          referenceType: servicePayment.referenceType,
          referenceId: servicePayment.referenceId,
        };
      }
      if (servicePayment.status !== PaymentStatus.PENDING) {
        return { success: false, message: `Statut service inattendu: ${servicePayment.status}` };
      }
      const payment = await this.prisma.servicePayment.update({
        where: { id: servicePayment.id },
        data: {
          status: outcome === 'COMPLETED' ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
          failureReason: outcome === 'FAILED' ? message ?? 'Paiement Mobile Money refusé' : null,
        },
      });
      if (outcome === 'COMPLETED') {
        await this.publishPaymentCompleted({
          referenceType: payment.referenceType,
          referenceId: payment.referenceId,
          userId: payment.userId,
          amountCdf: payment.amountCdf,
          method: payment.method.toString(),
        });
        await this.creditDriverAfterServicePayment(payment.referenceType, payment.referenceId);
      }
      return {
        success: true,
        kind: 'SERVICE',
        status: payment.status,
        referenceType: payment.referenceType,
        referenceId: payment.referenceId,
      };
    }

    const topUp = await this.walletService.completePendingTopUp(refs[0], outcome, message, refs.slice(1));
    if (topUp.found) {
      return { success: true, kind: 'TOPUP', ...topUp };
    }

    if (outcome === 'FAILED') {
      const payout = await this.walletService.refundFailedPayout(refs, message);
      if (payout.found) {
        return { success: true, kind: 'PAYOUT', ...payout };
      }
    }

    this.logger.warn(`Webhook Mobile Money: aucune intention pour providerRef=${refs.join(',')}`);
    return { success: false, message: 'Référence Mobile Money inconnue' };
  }

  async getPassengerRidePaymentStatus(rideId: string, userId: string) {
    const ride = await this.fetchRide(rideId);
    if (ride.passengerId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const payment = await this.prisma.payment.findUnique({ where: { rideId } });
    return {
      rideId,
      status: payment?.status ?? null,
      method: payment?.method ?? null,
      providerRef: payment?.providerRef ?? null,
      isPaid: payment?.status === PaymentStatus.COMPLETED,
      pendingMobileMoney:
        payment?.status === PaymentStatus.PENDING && MOBILE_MONEY_METHODS.has(payment.method),
      failureReason: payment?.failureReason ?? null,
      amountCdf: payment?.amountCdf ?? null,
    };
  }

  async getPassengerServicePaymentStatus(referenceType: string, referenceId: string, userId: string) {
    const type = referenceType.toUpperCase();
    const payment = await this.prisma.servicePayment.findUnique({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
    });
    if (payment && payment.userId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    return {
      referenceType: type,
      referenceId,
      status: payment?.status ?? null,
      method: payment?.method ?? null,
      providerRef: payment?.providerRef ?? null,
      isPaid: payment?.status === PaymentStatus.COMPLETED,
      pendingMobileMoney:
        !!payment &&
        payment.status === PaymentStatus.PENDING &&
        MOBILE_MONEY_METHODS.has(payment.method),
      failureReason: payment?.failureReason ?? null,
      amountCdf: payment?.amountCdf ?? null,
    };
  }
}
