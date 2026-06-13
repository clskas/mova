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
      await this.walletService.debit(userId, amountCdf, `Paiement course ${rideId}`);
      const payment = await this.prisma.payment.upsert({
        where: { rideId },
        create: { rideId, userId, amountCdf, method, status: PaymentStatus.COMPLETED, providerRef: `wallet_${rideId}` },
        update: { status: PaymentStatus.COMPLETED, method, amountCdf },
      });
      await this.publishPaymentCompleted({ rideId, userId, amountCdf, method: method.toString() });
      return { success: true, payment, message: 'Paiement portefeuille effectué' };
    }
    if (method === PaymentMethod.CASH) {
      const payment = await this.prisma.payment.upsert({
        where: { rideId },
        create: { rideId, userId, amountCdf, method, status: PaymentStatus.COMPLETED, providerRef: `cash_${rideId}` },
        update: { status: PaymentStatus.COMPLETED, method, amountCdf },
      });
      await this.publishPaymentCompleted({ rideId, userId, amountCdf, method: 'CASH' });
      return { success: true, payment, message: 'Paiement espèces enregistré' };
    }
    return this.processPayment(rideId, userId, amountCdf, method, paymentPhone);
  }
}
