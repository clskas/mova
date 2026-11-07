import { PaymentMethod } from '@prisma/client';
import { MoneyAnomaly, MoneyControlService } from './money-control.service';

describe('MoneyControlService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    servicePayment: { findMany: jest.fn().mockResolvedValue([]) },
    walletTransaction: { findMany: jest.fn() },
    driverCashDebt: { findMany: jest.fn() },
    moneyControlRun: { create: jest.fn(async ({ data }) => data), findFirst: jest.fn() },
  };
  const service = new MoneyControlService(prisma as never);
  const prevFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.walletTransaction.findMany.mockResolvedValue([]);
    prisma.driverCashDebt.findMany.mockResolvedValue([]);
  });
  afterAll(() => {
    (global as unknown as { fetch: typeof fetch | undefined }).fetch = prevFetch;
  });

  const mockRide = (body: unknown) => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
  };
  const credit = (reference: string, amountCdf: number) => ({ type: 'CREDIT', reference, amountCdf, wallet: { userId: 'x' } });

  it('flags a wallet whose balance does not match its movements', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { id: 'w1', userId: 'u1', balance: 5000, held: 0, ledger: 5000, activeHolds: 0 },
      { id: 'w2', userId: 'u2', balance: 9000, held: 1000, ledger: 7000, activeHolds: 0 },
    ]);
    const run = (await service.run()) as unknown as { anomalies: MoneyAnomaly[]; anomalyCount: number };
    expect(run.anomalyCount).toBe(2);
    expect(run.anomalies.map((a) => a.kind).sort()).toEqual(['WALLET_BALANCE', 'WALLET_HELD']);
    expect(run.anomalies.every((a) => a.userId === 'u2')).toBe(true);
  });

  it('a correctly paid ride (wallet) gives no anomaly', async () => {
    mockRide({ driverId: 'd1', driverNetCdf: 8500 });
    prisma.walletTransaction.findMany.mockResolvedValue([
      credit('RIDE_PAYOUT:r1', 8500),
      credit('PLATFORM_FEE:RIDE:r1', 1500),
    ]);
    const out: MoneyAnomaly[] = [];
    await service.checkJob({ referenceType: 'RIDE', referenceId: 'r1', userId: 'p1', amountCdf: 10000, method: PaymentMethod.WALLET }, out);
    expect(out).toEqual([]);
  });

  it('flags a ride where money is missing and the driver was underpaid', async () => {
    mockRide({ driverId: 'd1', driverNetCdf: 8500 });
    prisma.walletTransaction.findMany.mockResolvedValue([credit('RIDE_PAYOUT:r2', 8000), credit('PLATFORM_FEE:RIDE:r2', 1500)]);
    const out: MoneyAnomaly[] = [];
    await service.checkJob({ referenceType: 'RIDE', referenceId: 'r2', userId: 'p1', amountCdf: 10000, method: PaymentMethod.WALLET }, out);
    expect(out.map((a) => a.kind).sort()).toEqual(['JOB_BALANCE', 'JOB_SHARE']);
    expect(out.find((a) => a.kind === 'JOB_SHARE')?.differenceCdf).toBe(-500);
  });

  it('cash ride: checks the commission owed by the driver (partial wallet payments added back)', async () => {
    mockRide({ driverId: 'd1', driverNetCdf: 8500 });
    prisma.driverCashDebt.findMany.mockResolvedValue([{ id: 'debt1', category: 'PLATFORM_FEE', amountCdf: 1000 }]);
    prisma.walletTransaction.findMany
      .mockResolvedValueOnce([]) // ledger of the job
      .mockResolvedValueOnce([{ amountCdf: -500 }]); // partial payment of debt1
    const out: MoneyAnomaly[] = [];
    await service.checkJob({ referenceType: 'RIDE', referenceId: 'r3', userId: 'p1', amountCdf: 10000, method: PaymentMethod.CASH }, out);
    expect(out).toEqual([]);
  });

  it('rental paid online with the deposit still held: reported as information, not an anomaly', async () => {
    mockRide({ depositCdf: 50000, ownerUserId: 'o1', partnerNetCdf: 88000, platformFeeCdf: 12000, rentalPaidCdf: 100000 });
    prisma.walletTransaction.findMany.mockResolvedValue([credit('RENTAL_OWNER:b1', 88000), credit('PLATFORM_FEE:RENTAL:b1', 12000)]);
    const out: MoneyAnomaly[] = [];
    await service.checkJob({ referenceType: 'RENTAL', referenceId: 'b1', userId: 'c1', amountCdf: 150000, method: PaymentMethod.WALLET }, out);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('INFO');
  });
});
