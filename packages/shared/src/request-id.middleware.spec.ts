import { RequestIdMiddleware, getOrCreateRequestId, RequestWithId } from './request-id.middleware';
import { Response } from 'express';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  it('generates a request id when header is missing', () => {
    const req = { headers: {}, method: 'GET', originalUrl: '/health' } as RequestWithId;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('reuses incoming X-Request-Id', () => {
    const req = { headers: { 'x-request-id': 'abc-123' } } as unknown as RequestWithId;
    expect(getOrCreateRequestId(req)).toBe('abc-123');
  });
});
