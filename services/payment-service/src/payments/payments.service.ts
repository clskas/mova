import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import {
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
  PaymentCompletedPayload,
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
import { AirtelMoneyProvider, MockPaymentProvider, MpesaProvider, OrangeMoneyProvider } from './payment-providers';
import { PaymentProvider } from './payment-provider.interface';

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
    private redis: RedisService,
    mock: MockPaymentProvider,
    orange: OrangeMoneyProvider,
    mpesa: MpesaProvider,
    airtel: AirtelMoneyProvider,
  ) {
    this.providers = new Map<PaymentMethod, PaymentProvider>([
      [PaymentMethod.ORANGE_MONEY, orange],
      [PaymentMethod.MPESA, mpesa],
      [PaymentMethod.AIRTEL_MONEY, airtel],
    ]);
    if (config.get('MOCK_PAYMENTS') === 'true') this.providers.set(PaymentMethod.WALLET, mock);
  }

  private getProvider(method: PaymentMethod): PaymentProvider {
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

  private async creditDriverAfterRidePayment(rideId: string) {
    const payout = await this.driverPayouts.fetchRidePayout(rideId);
    if (!payout?.driverId || payout.driverNetCdf <= 0) return;
    await this.driverPayouts.creditRidePayoutFromPayment(rideId, payout.driverId, payout.driverNetCdf);
  }

  private async creditDriverAfterServicePayment(referenceType: string, referenceId: string) {
    try {
      const res = await fetch(
        serviceUrl('ride', `/internal/services/${referenceType.toUpperCase()}/${referenceId}/payout`),
        { headers: { 'x-internal-api-key': INTERNAL_API_KEY } },
      );
      if (!res.ok) return;
      const payout = (await res.json()) as { driverId?: string; driverNetCdf?: number };
      if (!payout?.driverId || (payout.driverNetCdf ?? 0) <= 0) return;
      await this.driverPayouts.creditPayout(payout.driverId, {
        referenceType: referenceType.toUpperCase(),
        referenceId,
        driverNetCdf: payout.driverNetCdf ?? 0,
      });
    } catch (e) {
      this.logger.warn(`creditDriverAfterServicePayment ${referenceType}/${referenceId} failed`, e);
    }
  }

  async processPayment(rideId: string, userId: string, amountCdf: number, method: PaymentMethod, phone: string) {
    const provider = this.getProvider(method);
    const result = await provider.initiatePayment(amountCdf, phone, rideId);
    const payment = await this.prisma.payment.upsert({
      where: { rideId },
      create: { rideId, userId, amountCdf, method, status: result.success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED, providerRef: result.providerRef, failureReason: result.success ? null : result.message },
      update: { status: result.success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED, providerRef: result.providerRef, failureReason: result.success ? null : result.message },
    });
    if (!result.success) throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED);
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
        referenceType: string;
        referenceId: string;
        title?: string;
        driverId?: string | null;
        cashPin?: string | null;
      }>;
    } catch (e) {
      if (e instanceof MovaHttpException) throw e;
      this.logger.error(`fetchServicePaymentInfo ${referenceType}/${referenceId} unreachable`, e);
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.BAD_GATEWAY);
    }
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
    if (!info.paymentReady) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Le service n\'est pas prêt pour le paiement.');
    const amountCdf = amountOverride ?? info.amountCdf;
    if (amountCdf <= 0) throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED);
    const paymentPhone = this.resolvePaymentPhone(method, phone);
    const refKey = `${type}:${referenceId}`;

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
      return { success: true, payment, pendingCash: true, message: 'Paiement espèces en attente — communiquez le code PIN au livreur.', amountCdf, currency: 'CDF' };
    }

    const provider = this.getProvider(method);
    const result = await provider.initiatePayment(amountCdf, paymentPhone, refKey);
    const payment = await this.prisma.servicePayment.upsert({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
      create: {
        referenceType: type,
        referenceId,
        userId,
        amountCdf,
        method,
        status: result.success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
        providerRef: result.providerRef,
        failureReason: result.success ? null : result.message,
      },
      update: {
        status: result.success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
        providerRef: result.providerRef,
        failureReason: result.success ? null : result.message,
      },
    });
    if (!result.success) throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED);
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
    if (info.driverId !== driverUserId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    if (!info.paymentReady) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Le service n\'est pas prêt pour le paiement.');
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
}
