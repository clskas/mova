import { emptyPartnerWallet, fetchPartnerTransactions, fetchPartnerWallet } from './partner-wallet.util';

describe('partner-wallet.util', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('emptyPartnerWallet returns a usable zero snapshot', () => {
    const wallet = emptyPartnerWallet();
    expect(wallet.available).toBe(false);
    expect(wallet.balanceCdf).toBe(0);
    expect(wallet.transactions).toEqual([]);
    expect(wallet.formattedBalance).toContain('FC');
  });

  it('fetchPartnerWallet returns empty snapshot when payment is down', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as typeof fetch;
    const wallet = await fetchPartnerWallet('user-1');
    expect(wallet.available).toBe(false);
    expect(wallet.balanceCdf).toBe(0);
    expect(wallet.transactions).toEqual([]);
  });

  it('fetchPartnerWallet returns empty snapshot on HTTP 500', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal server error' }),
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

  it('fetchPartnerTransactions returns empty page when payment is down', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed')) as typeof fetch;
    const page = await fetchPartnerTransactions('user-1', { descriptionPrefix: 'Vente repas' });
    expect(page.available).toBe(false);
    expect(page.data).toEqual([]);
    expect(page.periodTotalCdf).toBe(0);
  });
});
