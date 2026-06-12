import { HealthController } from './health.controller';

jest.mock('@mova/shared', () => ({
  MARKET_RDC: { country: 'CD', defaultCity: 'Kinshasa' },
  SERVICE_PORTS: {
    auth: 3001,
    ride: 3002,
    payment: 3003,
    driver: 3004,
    notification: 3005,
    admin: 3006,
  },
  serviceUrl: (name: string) => `http://localhost:${name}/health`,
}));

describe('HealthController', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation((_url, opts?: RequestInit) => {
      opts?.signal?.addEventListener('abort', () => {});
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns gateway status', async () => {
    const controller = new HealthController();
    const result = await controller.health();
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('services');
    expect(Array.isArray(result.services)).toBe(true);
  });
});
