import { emptyPartnerWallet, fetchPartnerTransactions, fetchPartnerWallet } from './partner-wallet.util';

describe('partner-wallet.util', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('emptyPartnerWallet returns a usable zero snapshot', () => {
    const wallet = emptyPartnerWallet();
    expect(wallet.available).toBe(false);
    expect(wallet.balanceCdf).toBe(0);
    expect(wallet.transactions).toEqual([]);
    expect(wallet.formattedBalance).toContain('FC');
  });

  it('fetchPartnerWallet creates then retries on HTTP 404', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).includes('/internal/wallets')) {
        return { ok: true, status: 201, json: async () => ({ userId: 'user-1', balanceCdf: 0 }) };
      }
      if (String(url).includes('/internal/wallets/user-1')) {
        const calls = (global.fetch as jest.Mock).mock.calls.filter((c) =>
          String(c[0]).includes('/internal/wallets/user-1'),
        ).length;
        if (calls <= 1) {
          return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ balanceCdf: 0, formattedBalance: '0 FC', transactions: [] }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    }) as typeof fetch;

    const wallet = await fetchPartnerWallet('user-1');
    expect(wallet.available).toBe(true);
    expect(wallet.balanceCdf).toBe(0);
  });

  it('fetchPartnerWallet returns available 0 when payment is down but hub is healthy', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/health')) {
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
      }
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    const wallet = await fetchPartnerWallet('user-1');
    expect(wallet.available).toBe(true);
    expect(wallet.balanceCdf).toBe(0);
    expect(wallet.unavailableReason).toBeUndefined();
  });

  it('fetchPartnerWallet stays unavailable when payment and hub are both down', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as typeof fetch;
    const wallet = await fetchPartnerWallet('user-1');
    expect(wallet.available).toBe(false);
    expect(wallet.balanceCdf).toBe(0);
    expect(wallet.transactions).toEqual([]);
  });

  it('fetchPartnerWallet returns empty snapshot on HTTP 500 when hub is also down', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/health')) {
        return { ok: false, status: 502, json: async () => ({}) };
      }
      return { ok: false, status: 500, json: async () => ({ message: 'Internal server error' }) };
    }) as typeof fetch;
    const wallet = await fetchPartnerWallet('user-1');
    expect(wallet.available).toBe(false);
    expect(wallet.balanceCdf).toBe(0);
  });

  it('fetchPartnerWallet maps a healthy payment response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        balanceCdf: 15000,
        formattedBalance: '15 000 FC',
        transactions: [{ id: 'tx1', amountCdf: 15000, type: 'CREDIT', createdAt: new Date().toISOString() }],
      }),
    }) as typeof fetch;
    const wallet = await fetchPartnerWallet('user-1');
    expect(wallet.available).toBe(true);
    expect(wallet.balanceCdf).toBe(15000);
    expect(wallet.transactions).toHaveLength(1);
  });

  it('fetchPartnerTransactions returns empty page when payment and hub are down', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed')) as typeof fetch;
    const page = await fetchPartnerTransactions('user-1', { descriptionPrefix: 'Vente repas' });
    expect(page.available).toBe(false);
    expect(page.data).toEqual([]);
    expect(page.periodTotalCdf).toBe(0);
  });

  it('fetchPartnerTransactions returns available 0 when hub is healthy', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/health')) {
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
      }
      throw new Error('fetch failed');
    }) as typeof fetch;
    const page = await fetchPartnerTransactions('user-1', { descriptionPrefix: 'Vente repas' });
    expect(page.available).toBe(true);
    expect(page.balanceCdf).toBe(0);
    expect(page.data).toEqual([]);
  });
});
