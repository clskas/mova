import { HttpStatus } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PaymentsService } from './payments.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@mova/shared';
import {
  AirtelMoneyProvider,
  MockPaymentProvider,
  MpesaProvider,
  OrangeMoneyProvider,
} from './payment-providers';

describe('PaymentsService', () => {
  const prisma = {
    payment: {
      upsert: jest.fn().mockResolvedValue({ id: 'pay-1', rideId: 'ride-1', status: 'COMPLETED' }),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'pay-1', rideId: 'ride-1', status: 'COMPLETED' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    servicePayment: {
      upsert: jest.fn().mockResolvedValue({ id: 'spay-1', referenceType: 'DELIVERY', referenceId: 'del-1', status: 'COMPLETED' }),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'spay-1', status: 'COMPLETED' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const wallet = {
    debit: jest.fn().mockResolvedValue({ balanceCdf: 0 }),
    consumeHoldOrDebit: jest.fn().mockResolvedValue({ consumed: true, via: 'DEBIT' }),
    creditPlatformFee: jest.fn().mockResolvedValue(null),
    completePendingTopUp: jest.fn().mockResolvedValue({ found: false }),
    refundFailedPayout: jest.fn().mockResolvedValue({ found: false }),
  };
  const driverPayouts = {
    fetchRidePayout: jest.fn().mockResolvedValue(null),
    creditRidePayoutFromPayment: jest.fn().mockResolvedValue({ credited: false }),
  };
  const foodPayouts = {
    creditFromServicePayment: jest.fn().mockResolvedValue({ credited: false }),
  };
  const debtLedger = {
    recordCashDebt: jest.fn().mockResolvedValue(undefined),
  };
  const redis = {
    publish: jest.fn().mockResolvedValue(undefined),
    client: {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    },
  };
  const config = { get: jest.fn((key: string) => (key === 'MOCK_PAYMENTS' ? 'true' : undefined)) } as unknown as ConfigService;

  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    config,
    wallet as unknown as WalletService,
    driverPayouts as never,
    foodPayouts as never,
    debtLedger as never,
    redis as unknown as RedisService,
    new MockPaymentProvider(config),
    new OrangeMoneyProvider(config),
    new MpesaProvider(config),
    new AirtelMoneyProvider(config),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    redis.client.get.mockResolvedValue(null);
    redis.client.set.mockResolvedValue('OK');
    redis.client.del.mockResolvedValue(1);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        passengerId: 'user-1',
        status: 'COMPLETED',
        internalStatus: 'COMPLETED',
        finalFareCdf: 8500,
      }),
    }) as jest.Mock;
  });

  it('accepte WALLET sans numéro de téléphone (contrat mobile)', async () => {
    const result = await service.payRide('ride-1', 'user-1', PaymentMethod.WALLET, undefined, 1);
    expect(result.success).toBe(true);
    expect(wallet.debit).toHaveBeenCalledWith('user-1', 8500, expect.any(String), 'RIDE:ride-1');
  });

  it('ignore le amountCdf client et utilise finalFareCdf de la course', async () => {
    const result = await service.payRide('ride-1', 'user-1', PaymentMethod.WALLET, undefined, 100);
    expect(result.success).toBe(true);
    expect(wallet.debit).toHaveBeenCalledWith('user-1', 8500, expect.any(String), 'RIDE:ride-1');
    expect(wallet.debit).not.toHaveBeenCalledWith('user-1', 100, expect.any(String), expect.any(String));
  });

  it('accepte CASH sans numéro de téléphone', async () => {
    const result = await service.payRide('ride-1', 'user-1', PaymentMethod.CASH, undefined, 8500);
    expect(result.success).toBe(true);
  });

  it('utilise internalStatus pour valider une course terminée', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        passengerId: 'user-1',
        status: 'COMPLETED',
        internalStatus: 'COMPLETED',
        estimatedFareCdf: 5000,
      }),
    });
    await expect(service.payRide('ride-1', 'user-1', PaymentMethod.CASH)).resolves.toMatchObject({ success: true });
  });

  it('rejette le paiement si la course n\'est pas terminée', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        passengerId: 'user-1',
        status: 'IN_PROGRESS',
        internalStatus: 'IN_PROGRESS',
        estimatedFareCdf: 5000,
      }),
    });
    await expect(service.payRide('ride-1', 'user-1', PaymentMethod.CASH)).rejects.toMatchObject({
      code: MovaErrorCode.RIDE_INVALID_STATUS,
    });
  });

  it('exige un numéro pour Mobile Money', async () => {
    await expect(service.payRide('ride-1', 'user-1', PaymentMethod.ORANGE_MONEY, undefined, 8500)).rejects.toBeInstanceOf(
      MovaHttpException,
    );
  });

  it('paie une livraison terminée via portefeuille', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        userId: 'user-1',
        amountCdf: 12000,
        paymentReady: true,
        referenceType: 'DELIVERY',
        referenceId: 'del-1',
      }),
    });
    const result = await service.payService('DELIVERY', 'del-1', 'user-1', PaymentMethod.WALLET, undefined, 1);
    expect(result.success).toBe(true);
    expect(wallet.consumeHoldOrDebit).toHaveBeenCalledWith(
      'user-1',
      12000,
      'DELIVERY',
      'del-1',
      expect.any(String),
    );
    expect(prisma.servicePayment.upsert).toHaveBeenCalled();
  });

  it('verrouille le PIN espèces après 5 échecs', async () => {
    redis.client.get.mockResolvedValue('5');
    await expect(service.confirmCashRide('ride-1', 'driver-1', '0000')).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_PIN_LOCKED },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuse le PIN espèces si Redis est down (fail-closed)', async () => {
    redis.client.get.mockRejectedValue(new Error('redis down'));
    await expect(service.confirmCashRide('ride-1', 'driver-1', '1234')).rejects.toMatchObject({
      response: { code: MovaErrorCode.INTERNAL_ERROR },
    });
  });

  it('rejette le paiement service si non terminé', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        userId: 'user-1',
        amountCdf: 12000,
        paymentReady: false,
        referenceType: 'DELIVERY',
        referenceId: 'del-1',
      }),
    });
    await expect(service.payService('DELIVERY', 'del-1', 'user-1', PaymentMethod.CASH)).rejects.toMatchObject({
      code: MovaErrorCode.VALIDATION_ERROR,
    });
  });

  it('webhook course : refuse si montant SerdiPay ≠ tarif (sous-paiement)', async () => {
    prisma.payment.findFirst.mockResolvedValueOnce({
      id: 'pay-mm',
      rideId: 'ride-1',
      userId: 'user-1',
      amountCdf: 8500,
      method: PaymentMethod.ORANGE_MONEY,
      status: 'PENDING',
      providerRef: 'sp_ride1',
    });
    const result = await service.completeMobileMoneyFromWebhook('sp_ride1', 'COMPLETED', undefined, [], 5000);
    expect(result).toMatchObject({ success: true, kind: 'RIDE', status: 'FAILED', rideId: 'ride-1' });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: expect.stringContaining('insuffisant'),
        }),
      }),
    );
    expect(driverPayouts.creditRidePayoutFromPayment).not.toHaveBeenCalled();
  });

  it('webhook course : refuse si montant SerdiPay ≠ tarif (surpaiement, fail-closed)', async () => {
    prisma.payment.findFirst.mockResolvedValueOnce({
      id: 'pay-mm',
      rideId: 'ride-1',
      userId: 'user-1',
      amountCdf: 8500,
      method: PaymentMethod.MPESA,
      status: 'PENDING',
      providerRef: 'sp_ride2',
    });
    const result = await service.completeMobileMoneyFromWebhook('sp_ride2', 'COMPLETED', undefined, [], 9000);
    expect(result).toMatchObject({ success: true, kind: 'RIDE', status: 'FAILED' });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: expect.stringContaining('supérieur'),
        }),
      }),
    );
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('webhook course : valide si montant confirmé = tarif', async () => {
    prisma.payment.findFirst.mockResolvedValueOnce({
      id: 'pay-mm',
      rideId: 'ride-1',
      userId: 'user-1',
      amountCdf: 8500,
      method: PaymentMethod.AIRTEL_MONEY,
      status: 'PENDING',
      providerRef: 'sp_ride3',
    });
    const result = await service.completeMobileMoneyFromWebhook('sp_ride3', 'COMPLETED', undefined, [], 8500);
    expect(result).toMatchObject({ success: true, kind: 'RIDE', status: 'COMPLETED', rideId: 'ride-1' });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', failureReason: null }),
      }),
    );
  });
});
