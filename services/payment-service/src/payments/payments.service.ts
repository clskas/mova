import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import {
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
  PaymentCompletedPayload,
  INTERNAL_API_KEY,
  serviceUrl,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { AirtelMoneyProvider, MockPaymentProvider, MpesaProvider, OrangeMoneyProvider } from './payment-providers';
import { PaymentProvider } from './payment-provider.interface';

@Injectable()
export class PaymentsService {
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
  private async fetchRide(rideId: string) {
    const res = await fetch(serviceUrl('ride', `/internal/rides/${rideId}`), { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
    if (!res.ok) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return res.json();
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
    await this.redis.publish(MOVA_EVENTS.PAYMENT_COMPLETED, { rideId, userId, amountCdf, method } as PaymentCompletedPayload);
    return { payment, ...result };
  }
  async payRide(rideId: string, userId: string, method: PaymentMethod, phone: string, amountOverride?: number) {
    const ride = await this.fetchRide(rideId);
    if (ride.passengerId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (ride.status !== 'COMPLETED') throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    const amountCdf = amountOverride ?? ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0;
    if (amountCdf <= 0) throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED);
    if (method === PaymentMethod.WALLET) {
      await this.walletService.debit(userId, amountCdf, `Paiement course ${rideId}`);
      const payment = await this.prisma.payment.upsert({
        where: { rideId },
        create: { rideId, userId, amountCdf, method, status: PaymentStatus.COMPLETED, providerRef: `wallet_${rideId}` },
        update: { status: PaymentStatus.COMPLETED, method, amountCdf },
      });
      await this.redis.publish(MOVA_EVENTS.PAYMENT_COMPLETED, { rideId, userId, amountCdf, method: method.toString() });
      return { success: true, payment, message: 'Paiement portefeuille effectué' };
    }
    if (method === PaymentMethod.CASH) {
      const payment = await this.prisma.payment.upsert({
        where: { rideId },
        create: { rideId, userId, amountCdf, method, status: PaymentStatus.COMPLETED, providerRef: `cash_${rideId}` },
        update: { status: PaymentStatus.COMPLETED, method, amountCdf },
      });
      await this.redis.publish(MOVA_EVENTS.PAYMENT_COMPLETED, { rideId, userId, amountCdf, method: 'CASH' });
      return { success: true, payment, message: 'Paiement espèces enregistré' };
    }
    return this.processPayment(rideId, userId, amountCdf, method, phone);
  }
}
