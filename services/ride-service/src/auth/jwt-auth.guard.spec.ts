import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctx(method: string, url: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: url, url, headers: {} }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('ride-service JwtAuthGuard public paths', () => {
  const guard = new JwtAuthGuard();

  it.each([
    ['GET', '/api/geo/communes'],
    ['GET', '/api/geo/autocomplete?q=gombe'],
    ['GET', '/api/uploads/menu/abc.jpg'],
    ['GET', '/api/public/trips/tok123'],
    ['GET', '/api/rental/vehicles'],
    ['POST', '/api/rides/estimate'],
    ['GET', '/api/publicites'],
  ])('lets %s %s through without a token', (method, url) => {
    expect(guard.canActivate(ctx(method, url))).toBe(true);
  });

  it.each([
    ['GET', '/api/rides/geo-123'],
    ['GET', '/api/restaurant/orders/x/public/y'],
    ['GET', '/api/uploads/kyc/abc.jpg'],
    ['POST', '/api/geo/places/import'],
    ['GET', '/api/deliveries/abc/geo'],
  ])('requires a token for %s %s', (method, url) => {
    const superActivate = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(false);
    expect(guard.canActivate(ctx(method, url))).toBe(false);
    expect(superActivate).toHaveBeenCalled();
    superActivate.mockRestore();
  });
});
