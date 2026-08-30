import { ConfigService } from '@nestjs/config';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const tx = {
    wallet: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    walletTransaction: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const prisma = {
    wallet: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    walletTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    walletHold: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    $queryRaw: tx.$queryRaw,
  };

  const configGet = jest.fn((key: string): string | undefined => {
    if (key === 'MOCK_PAYMENTS') return 'true';
    if (key === 'NODE_ENV') return 'test';
    return undefined;
  });
  const config = { get: configGet } as unknown as ConfigService;

  const service = new WalletService(prisma as never, config);

  beforeEach(() => {
    jest.clearAllMocks();
    configGet.mockImplementation((key: string) => {
      if (key === 'MOCK_PAYMENTS') return 'true';
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    });
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    prisma.walletTransaction.findFirst.mockResolvedValue(null);
    tx.walletTransaction.findFirst.mockResolvedValue(null);
    tx.walletTransaction.create.mockResolvedValue({});
  });

  it('crédite le portefeuille via top-up mock hors production', async () => {
    prisma.wallet.upsert.mockResolvedValue({ id: 'w1', userId: 'u1', balanceCdf: 1000 });
    prisma.walletTransaction.findFirst.mockResolvedValue(null);
    tx.$queryRaw.mockResolvedValue([{ id: 'w1' }]);
    tx.wallet.update.mockResolvedValue({ id: 'w1', balanceCdf: 6000 });
    const result = await service.topUp('u1', 5000, 'MOCK');
    expect(result.success).toBe(true);
    expect(result.amountCdf).toBe(5000);
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balanceCdf: { increment: 5000 } },
    });
  });

  it('refuse MOCK / crédit simulé en production', async () => {
    configGet.mockImplementation((key: string) => {
      if (key === 'MOCK_PAYMENTS') return 'true';
      if (key === 'NODE_ENV') return 'production';
      return undefined;
    });
    await expect(service.topUp('u1', 5000, 'MOCK')).rejects.toMatchObject({
      response: { message: expect.stringMatching(/interdit en production/i) },
    });
  });

  it('refuse un crédit négatif ou non entier', async () => {
    await expect(service.credit('u1', -500, 'fraude')).rejects.toMatchObject({
      response: { code: 'MOVA_VAL_001' },
    });
    await expect(service.credit('u1', 1.5, 'fraude')).rejects.toMatchObject({
      response: { code: 'MOVA_VAL_001' },
    });
  });

  it('rejette un opérateur inconnu (pas de fallback Airtel/Orange)', async () => {
    prisma.wallet.upsert.mockResolvedValue({ id: 'w1', userId: 'u1', balanceCdf: 0 });
    prisma.walletTransaction.findFirst.mockResolvedValue(null);
    await expect(service.topUp('u1', 5000, 'UNKNOWN_TELCO', '+243970000001')).rejects.toMatchObject({
      response: { code: 'MOVA_PAY_003' },
    });
  });

  it('ferme le débit public POST /wallet/pay', async () => {
    await expect(service.payFromWallet('u1', 3000, 'DELIVERY', 'del-1')).rejects.toMatchObject({
      response: { code: 'MOVA_AUTH_003' },
    });
  });

  it('crée le portefeuille au premier getWallet', async () => {
    prisma.wallet.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'w-new', userId: 'u-new', balanceCdf: 0, heldBalanceCdf: 0, transactions: [] });
    prisma.wallet.upsert.mockResolvedValue({ id: 'w-new', userId: 'u-new', balanceCdf: 0 });
    const result = await service.getWallet('u-new');
    expect(prisma.wallet.upsert).toHaveBeenCalledWith({
      where: { userId: 'u-new' },
      create: { userId: 'u-new', balanceCdf: 0 },
      update: {},
    });
    expect(result.balanceCdf).toBe(0);
    expect(result.formattedBalance).toContain('FC');
  });

  it('refuse un débit si solde insuffisant (verrou FOR UPDATE)', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'w1', balanceCdf: 100, heldBalanceCdf: 0 }]);
    await expect(service.debit('u1', 500, 'test')).rejects.toMatchObject({
      response: { code: 'MOVA_PAY_002' },
    });
  });

  it('compare le montant hub avant de créditer une recharge PENDING', async () => {
    prisma.walletTransaction.findFirst.mockResolvedValue({
      id: 'tx-pending',
      walletId: 'w1',
      amountCdf: 5000,
      type: 'TOPUP_PENDING',
      description: 'Recharge OM en attente',
      reference: 'senga_topup_1',
      wallet: { balanceCdf: 0 },
    });
    prisma.walletTransaction.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.completePendingTopUp('senga_topup_1', 'COMPLETED', undefined, [], 100);
    expect(result.status).toBe('FAILED');
    expect(prisma.walletTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'TOPUP_FAILED' }),
      }),
    );
  });
});
