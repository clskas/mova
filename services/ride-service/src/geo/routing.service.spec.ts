import { RoutingService, routeCoords } from './routing.service';
import { mockPlatformConfig } from '../platform/platform-config.mock';

describe('RoutingService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OSRM_ENABLED;
    delete process.env.OSRM_BASE_URL;
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });

  it('asks Mapbox first when a key is set', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: 6100, duration: 900 }] }),
    });
    global.fetch = fetchMock as never;
    const result = await new RoutingService(mockPlatformConfig()).resolveRoadDistance(-4.32, 15.31, -4.34, 15.33);
    expect(result).toMatchObject({ source: 'mapbox', distanceKm: 6.1, durationMin: 15 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.mapbox.com/directions');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Mapbox fails: OSRM next', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 5420, duration: 720 }] }) }) as never;
    const result = await new RoutingService(mockPlatformConfig()).resolveRoadDistance(-4.32, 15.31, -4.34, 15.33);
    expect(result.source).toBe('osrm');
  });

  it('routeCoords keeps only real coordinates', () => {
    expect(routeCoords(-4.32, 15.31, -4.34, 15.33)).toBe('15.310000,-4.320000;15.330000,-4.340000');
    expect(routeCoords(Number('x'), 15, 1, 1)).toBeNull();
    expect(routeCoords(95, 15, 1, 1)).toBeNull();
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
