import { ConfigService } from '@nestjs/config';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const prisma = {
    wallet: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    walletTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const config = {
    get: jest.fn((key: string) => (key === 'MOCK_PAYMENTS' ? 'true' : undefined)),
  } as unknown as ConfigService;

  const service = new WalletService(prisma as never, config);

  beforeEach(() => jest.clearAllMocks());

  it('crédite le portefeuille via top-up mock', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balanceCdf: 1000 });
    prisma.wallet.update.mockResolvedValue({ id: 'w1', balanceCdf: 6000 });
    prisma.walletTransaction.create.mockResolvedValue({});
    const result = await service.topUp('u1', 5000, 'MOCK');
    expect(result.success).toBe(true);
    expect(result.amountCdf).toBe(5000);
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balanceCdf: { increment: 5000 } },
    });
  });

  it('refuse un débit si solde insuffisant', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balanceCdf: 100, transactions: [] });
    await expect(service.debit('u1', 500, 'test')).rejects.toMatchObject({
      response: { code: 'MOVA_PAY_002' },
    });
  });

  it('paie un service depuis le portefeuille', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balanceCdf: 10000, transactions: [] });
    prisma.wallet.update.mockResolvedValue({ id: 'w1', balanceCdf: 7000 });
    prisma.walletTransaction.create.mockResolvedValue({});
    const result = await service.payFromWallet('u1', 3000, 'DELIVERY', 'del-1');
    expect(result.success).toBe(true);
    expect(result.referenceType).toBe('DELIVERY');
  });
});
