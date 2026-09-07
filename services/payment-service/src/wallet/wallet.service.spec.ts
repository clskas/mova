import { ConfigService } from '@nestjs/config';
import { WalletService, __resetWithdrawOtpMemoryForTests } from './wallet.service';
import { SERDIPAY_B2C_MERCHANT_FLOAT_LOW_FR, TEST_OTP_CODE } from '@mova/shared';

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
      updateMany: jest.fn(),
    },
    walletHold: {
      updateMany: jest.fn(),
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
      updateMany: jest.fn(),
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
    __resetWithdrawOtpMemoryForTests();
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

  it('refuse une 2e recharge identique pendant le verrou Redis 60s', async () => {
    const redis = {
      client: {
        set: jest.fn().mockResolvedValue(null),
      },
    };
    const locked = new WalletService(prisma as never, config, redis as never);
    prisma.wallet.upsert.mockResolvedValue({ id: 'w1', userId: 'u1', balanceCdf: 0 });
    await expect(locked.topUp('u1', 5000, 'ORANGE_MONEY', '+243970000001')).rejects.toMatchObject({
      response: { message: expect.stringMatching(/déjà en cours/i) },
    });
  });

  it('refuse la recharge si Redis est down (fail-closed)', async () => {
    const redis = {
      client: {
        set: jest.fn().mockRejectedValue(new Error('redis down')),
      },
    };
    const locked = new WalletService(prisma as never, config, redis as never);
    await expect(locked.topUp('u1', 5000, 'ORANGE_MONEY', '+243970000001')).rejects.toMatchObject({
      response: { code: 'MOVA_INT_001' },
    });
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

  it('crédite le wallet sur webhook SUCCESS (montant intention)', async () => {
    prisma.walletTransaction.findFirst.mockResolvedValue({
      id: 'tx-pending',
      walletId: 'w1',
      amountCdf: 2300,
      type: 'TOPUP_PENDING',
      description: 'Recharge MPESA en attente',
      reference: 'pay_8137b15301ec2980b07a3388',
      wallet: { balanceCdf: 0 },
    });
    tx.walletTransaction.updateMany.mockResolvedValue({ count: 1 });
    tx.wallet.update.mockResolvedValue({ id: 'w1', balanceCdf: 2300 });
    const result = await service.completePendingTopUp(
      'pay_8137b15301ec2980b07a3388',
      'COMPLETED',
      undefined,
      ['senga_topup_f9151069-8c12-433d-8c80-3fb02c7e7cb2'],
      2300,
    );
    expect(result).toMatchObject({ found: true, status: 'COMPLETED', balanceCdf: 2300 });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balanceCdf: { increment: 2300 } },
    });
  });

  it('ne double-crédite pas un webhook SUCCESS rejoué', async () => {
    prisma.walletTransaction.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'tx-done',
        type: 'TOPUP_COMPLETED',
        reference: 'pay_8137b15301ec2980b07a3388',
        wallet: { balanceCdf: 2300 },
      });
    const result = await service.completePendingTopUp('pay_8137b15301ec2980b07a3388', 'COMPLETED');
    expect(result).toMatchObject({ found: true, alreadyFinal: true, status: 'COMPLETED', balanceCdf: 2300 });
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });

  it('refuse un 2e retrait pendant le verrou Redis', async () => {
    const redis = {
      client: {
        set: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(1),
      },
    };
    const locked = new WalletService(prisma as never, config, redis as never);
    await expect(
      locked.withdrawToMobileMoney('u1', 5000, 'ORANGE_MONEY', '+243970000001', { skipOtp: true }),
    ).rejects.toMatchObject({
      response: { message: expect.stringMatching(/déjà en cours/i) },
    });
    expect(redis.client.del).not.toHaveBeenCalled();
  });

  it('ne recapture pas un séquestre déjà pris (CAS status=ACTIVE)', async () => {
    prisma.walletHold.findUnique.mockResolvedValue({
      id: 'h1',
      walletId: 'w1',
      amountCdf: 12000,
      status: 'ACTIVE',
    });
    tx.walletHold.updateMany.mockResolvedValue({ count: 0 });
    const result = await service.captureHold('DELIVERY', 'del-1');
    expect(result).toEqual({ captured: false });
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });

  it('ne rembourse pas deux fois un retrait B2C échoué', async () => {
    prisma.walletTransaction.findFirst
      .mockResolvedValueOnce({
        id: 'd1',
        walletId: 'w1',
        amountCdf: -5000,
        reference: 'senga_withdraw_1',
        type: 'DEBIT',
        wallet: { userId: 'u1', balanceCdf: 0 },
      })
      .mockResolvedValueOnce({
        id: 'c1',
        reference: 'rollback_senga_withdraw_1',
        type: 'CREDIT',
      });
    const first = await service.refundFailedPayout(['senga_withdraw_1'], 'Merchant not allowed');
    expect(first).toEqual({ found: true, refunded: false });
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });

  it('traite P2002 crédit comme déjà crédité (pas de 500)', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'w1' }]);
    tx.wallet.update.mockResolvedValue({ id: 'w1', balanceCdf: 2300 });
    tx.walletTransaction.create.mockRejectedValue({ code: 'P2002' });
    prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balanceCdf: 2300 });
    const wallet = await service.credit('u1', 2300, 'Recharge', 'pay_dup');
    expect(wallet).toMatchObject({ balanceCdf: 2300 });
  });

  it('crédite 2300 FC si le hub confirme 2366 (frais opérateur)', async () => {
    prisma.walletTransaction.findFirst.mockResolvedValue({
      id: 'tx-pending',
      walletId: 'w1',
      amountCdf: 2300,
      type: 'TOPUP_PENDING',
      description: 'Recharge MPESA en attente',
      reference: 'sp_SD2609053C7J9',
      wallet: { balanceCdf: 0 },
    });
    tx.walletTransaction.updateMany.mockResolvedValue({ count: 1 });
    tx.wallet.update.mockResolvedValue({ id: 'w1', balanceCdf: 2300 });
    const result = await service.completePendingTopUp('sp_SD2609053C7J9', 'COMPLETED', undefined, [], 2366);
    expect(result).toMatchObject({ found: true, status: 'COMPLETED', balanceCdf: 2300 });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balanceCdf: { increment: 2300 } },
    });
  });

  it('autorise le retrait simulé après OTP envoyé au numéro de versement', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'w1', balanceCdf: 5000, heldBalanceCdf: 0 }]);
    tx.wallet.update.mockResolvedValue({ id: 'w1', userId: 'u1', balanceCdf: 2700 });
    const otp = await service.requestWithdrawOtp('u1', 2300, 'ORANGE_MONEY', '+243970000001');
    expect(otp.phone).toBe('+243970000001');
    expect(otp.message).toMatch(/243970000001/);
    const result = await service.withdrawToMobileMoney('u1', 2300, 'ORANGE_MONEY', '+243970000001', {
      otp: TEST_OTP_CODE,
    });
    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(tx.wallet.update).toHaveBeenCalledTimes(1);
  });

  it('autorise un retrait partiel (pas seulement le solde entier)', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'w1', balanceCdf: 5000, heldBalanceCdf: 0 }]);
    tx.wallet.update.mockResolvedValue({ id: 'w1', userId: 'u1', balanceCdf: 2700 });
    await service.requestWithdrawOtp('u1', 2300, 'MPESA', '+243810000002');
    const result = await service.withdrawToMobileMoney('u1', 2300, 'MPESA', '+243810000002', {
      otp: TEST_OTP_CODE,
    });
    expect(result.success).toBe(true);
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balanceCdf: { decrement: 2300 } },
    });
  });

  it('refuse un retrait sous le plancher Mobile Money (2000 de 2300)', async () => {
    await expect(
      service.withdrawToMobileMoney('u1', 2000, 'MPESA', '+243810000002', { skipOtp: true }),
    ).rejects.toMatchObject({
      response: { message: expect.stringMatching(/2300|2[\s\u00A0\u202F]?300/) },
    });
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });

  it('refuse un retrait B2C sans OTP', async () => {
    await expect(
      service.withdrawToMobileMoney('u1', 2300, 'ORANGE_MONEY', '+243970000001'),
    ).rejects.toMatchObject({
      response: {
        code: 'MOVA_AUTH_001',
        message: expect.stringMatching(/Code OTP requis/i),
      },
    });
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });

  it('refuse un retrait si l’OTP a été envoyé vers un autre numéro', async () => {
    await service.requestWithdrawOtp('u1', 2300, 'ORANGE_MONEY', '+243970000001');
    await expect(
      service.withdrawToMobileMoney('u1', 2300, 'ORANGE_MONEY', '+243810000002', {
        otp: TEST_OTP_CODE,
      }),
    ).rejects.toMatchObject({
      response: { message: expect.stringMatching(/ne correspond pas à ce numéro/i) },
    });
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });

  it('ne double-débite pas si le B2C SerdiPay échoue (float marchand)', async () => {
    configGet.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      if (key === 'PAY_HUB_URL') return 'https://pay.test.local';
      if (key === 'AFRISOFT_HUB_APP_ID') return 'senga';
      if (key === 'AFRISOFT_HUB_API_KEY') return 'test-key';
      return undefined;
    });
    prisma.walletTransaction.findFirst.mockResolvedValue(null);
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'w1', balanceCdf: 5000, heldBalanceCdf: 0 }])
      .mockResolvedValueOnce([{ id: 'w1' }]);
    tx.wallet.update
      .mockResolvedValueOnce({ id: 'w1', userId: 'u1', balanceCdf: 2700 })
      .mockResolvedValueOnce({ id: 'w1', userId: 'u1', balanceCdf: 5000 });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Your Balance is low' }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await expect(
      service.withdrawToMobileMoney('u1', 2300, 'ORANGE_MONEY', '+243970000001', { skipOtp: true }),
    ).rejects.toMatchObject({
      response: { message: SERDIPAY_B2C_MERCHANT_FLOAT_LOW_FR },
    });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balanceCdf: { decrement: 2300 } },
    });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balanceCdf: { increment: 2300 } },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'CREDIT', amountCdf: 2300 }),
      }),
    );
  });
});
