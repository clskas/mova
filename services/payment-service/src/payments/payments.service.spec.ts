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
    payment: { upsert: jest.fn().mockResolvedValue({ id: 'pay-1', rideId: 'ride-1' }) },
    servicePayment: { upsert: jest.fn().mockResolvedValue({ id: 'spay-1', referenceType: 'DELIVERY', referenceId: 'del-1' }) },
  };
  const wallet = {
    debit: jest.fn().mockResolvedValue({ balanceCdf: 0 }),
  };
  const redis = { publish: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn((key: string) => (key === 'MOCK_PAYMENTS' ? 'true' : undefined)) } as unknown as ConfigService;

  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    config,
    wallet as unknown as WalletService,
    redis as unknown as RedisService,
    new MockPaymentProvider(config),
    new OrangeMoneyProvider(config),
    new MpesaProvider(config),
    new AirtelMoneyProvider(config),
  );

  beforeEach(() => {
    jest.clearAllMocks();
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
    const result = await service.payRide('ride-1', 'user-1', PaymentMethod.WALLET, undefined, 8500);
    expect(result.success).toBe(true);
    expect(wallet.debit).toHaveBeenCalledWith('user-1', 8500, expect.any(String), 'RIDE:ride-1');
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
    const result = await service.payService('DELIVERY', 'del-1', 'user-1', PaymentMethod.WALLET, undefined, 12000);
    expect(result.success).toBe(true);
    expect(wallet.debit).toHaveBeenCalledWith('user-1', 12000, expect.any(String), 'DELIVERY:del-1');
    expect(prisma.servicePayment.upsert).toHaveBeenCalled();
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
});
