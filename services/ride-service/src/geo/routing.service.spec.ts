import { RoutingService } from './routing.service';
import { mockPlatformConfig } from '../platform/platform-config.mock';

describe('RoutingService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OSRM_ENABLED;
    delete process.env.OSRM_BASE_URL;
  });

  it('returns stored distance when provided', async () => {
    const service = new RoutingService(mockPlatformConfig());
    const km = await service.roadDistanceKm(-4.32, 15.31, -4.34, 15.33, 4.12);
    expect(km).toBe(4.12);
  });

  it('uses OSRM route distance when available', async () => {
    process.env.OSRM_ENABLED = 'true';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ distance: 5420, duration: 720 }],
      }),
    }) as never;

    const service = new RoutingService(mockPlatformConfig());
    const result = await service.resolveRoadDistance(-4.32, 15.31, -4.34, 15.33);
    expect(result.source).toBe('osrm');
    expect(result.distanceKm).toBe(5.42);
    expect(result.durationMin).toBe(12);
  });

  it('falls back to estimated distance when OSRM fails', async () => {
    process.env.OSRM_ENABLED = 'true';
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as never;

    const service = new RoutingService(mockPlatformConfig());
    const result = await service.resolveRoadDistance(-4.32, 15.31, -4.34, 15.33);
    expect(result.source).toBe('estimated');
    expect(result.distanceKm).toBeGreaterThan(0);
  });
});
