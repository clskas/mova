import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { AdminService } from './admin.service';

describe('AdminService promo city scope', () => {
  const service = new AdminService();
  const fetchJson = jest.fn();
  const proxy = jest.fn();

  beforeEach(() => {
    fetchJson.mockReset();
    proxy.mockReset();
    (service as unknown as { fetchJson: typeof fetchJson }).fetchJson = fetchJson;
    (service as unknown as { proxy: typeof proxy }).proxy = proxy;
    fetchJson.mockResolvedValue([
      { id: 'n1', code: 'NAT', cityNames: [] },
      { id: 'g1', code: 'GOMA10', cityNames: ['Goma'] },
      { id: 'k1', code: 'KIN10', cityNames: ['Kinshasa'] },
      { id: 'm1', code: 'MULTI', cityNames: ['Goma', 'Kinshasa'] },
    ]);
    proxy.mockResolvedValue({ ok: true });
  });

  it('CITY_ADMIN ne voit que national + sa ville', async () => {
    const rows = (await service.listPromoCodesScoped('Goma')) as Array<{ code: string }>;
    expect(rows.map((r) => r.code).sort()).toEqual(['GOMA10', 'MULTI', 'NAT']);
  });

  it('force cityNames à la ville gérée à la création', async () => {
    await service.createPromoCode({ code: 'X', discountPercent: 10, cityNames: [] }, 'Goma');
    expect(proxy).toHaveBeenCalledWith(
      'ride',
      '/internal/promo-codes',
      expect.objectContaining({
        body: JSON.stringify({ code: 'X', discountPercent: 10, cityNames: ['Goma'] }),
      }),
    );
  });

  it('refuse de modifier un code national', async () => {
    await expect(service.updatePromoCode('n1', { isActive: false }, 'Goma')).rejects.toBeInstanceOf(
      MovaHttpException,
    );
    try {
      await service.updatePromoCode('n1', { isActive: false }, 'Goma');
    } catch (e) {
      expect((e as MovaHttpException).code).toBe(MovaErrorCode.AUTH_FORBIDDEN);
    }
  });

  it('autorise de modifier un code limité à sa ville', async () => {
    await service.updatePromoCode('g1', { discountPercent: 15 }, 'Goma');
    expect(proxy).toHaveBeenCalledWith(
      'ride',
      '/internal/promo-codes/g1',
      expect.objectContaining({
        body: JSON.stringify({ discountPercent: 15, cityNames: ['Goma'] }),
      }),
    );
  });
});
