import { TrackingGateway, extractHandshakeToken, trackingGatewayCorsOptions } from './tracking.gateway';

function mockSocket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sock-1',
    handshake: { auth: { token: 'jwt-token' }, headers: {} },
    data: { user: { id: 'driver-1', role: 'DRIVER' } },
    emit: jest.fn(),
    join: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  };
}

describe('TrackingGateway', () => {
  const tracking = {
    isRideParticipant: jest.fn(),
    isDeliveryParticipant: jest.fn(),
    isErrandParticipant: jest.fn(),
    isMovingParticipant: jest.fn(),
    isRentalParticipant: jest.fn(),
    canJoinCourierRoom: jest.fn(),
    userCanAccessReference: jest.fn(),
    recordPoint: jest.fn(),
    normalizeType: jest.fn(),
  };
  const jwt = { verify: jest.fn() };
  const gateway = new TrackingGateway(tracking as never, jwt as never);
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway.server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as never;
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as never;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('does not use origin * for CORS', () => {
    const prev = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'https://senga.afri-soft.com';
    const cors = trackingGatewayCorsOptions();
    expect(cors.origin).not.toBe('*');
    expect(cors.origin).toBe('https://senga.afri-soft.com');
    if (prev === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = prev;
  });

  it('denies CORS when resolveCorsOrigin returns false', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevCors = process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    expect(trackingGatewayCorsOptions()).toEqual({ origin: false });
    process.env.NODE_ENV = prevEnv;
    if (prevCors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = prevCors;
  });

  it('extracts JWT from auth.token or Authorization header', () => {
    expect(
      extractHandshakeToken({ handshake: { auth: { token: 'Bearer abc' }, headers: {} } } as never),
    ).toBe('abc');
    expect(
      extractHandshakeToken({
        handshake: { auth: {}, headers: { authorization: 'Bearer xyz' } },
      } as never),
    ).toBe('xyz');
    expect(extractHandshakeToken({ handshake: { auth: {}, headers: {} } } as never)).toBeNull();
  });

  it('disconnects when JWT is missing or invalid', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('bad');
    });
    const client = mockSocket({ data: {}, handshake: { auth: { token: 'bad' }, headers: {} } });
    gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('stores JWT user on connect', () => {
    jwt.verify.mockReturnValue({ sub: 'u1', role: 'PASSENGER' });
    const client = mockSocket({ data: {}, handshake: { auth: { token: 'ok' }, headers: {} } });
    gateway.handleConnection(client as never);
    expect(client.data.user).toEqual({ id: 'u1', role: 'PASSENGER' });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('joins driver room for JWT sub only', () => {
    const client = mockSocket();
    const result = gateway.handleDriverSubscribe(client as never);
    expect(client.join).toHaveBeenCalledWith('driver:driver-1');
    expect(result).toEqual({ subscribed: 'driver-1' });
  });

  it('rejects ride subscribe for non-participants', async () => {
    tracking.isRideParticipant.mockResolvedValue(false);
    const result = await gateway.handleRideSubscribe(mockSocket() as never, { rideId: 'ride-9' });
    expect(result).toEqual({ subscribed: false });
  });

  it('joins ride room for participants', async () => {
    tracking.isRideParticipant.mockResolvedValue(true);
    const client = mockSocket();
    const result = await gateway.handleRideSubscribe(client as never, { rideId: 'ride-1' });
    expect(client.join).toHaveBeenCalledWith('ride:ride-1');
    expect(result).toEqual({ subscribed: 'ride-1' });
  });

  it('updates driver coords with JWT Bearer only (no internal key fallback)', async () => {
    tracking.isRideParticipant.mockResolvedValue(true);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });
    await gateway.handleDriverLocation(mockSocket() as never, {
      userId: 'attacker',
      lat: -4.3,
      lng: 15.3,
      rideId: 'ride-1',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer jwt-token');
    expect(init.headers['x-internal-api-key']).toBeUndefined();
    expect(JSON.stringify(init)).not.toContain('attacker');
  });

  it('rejects chat join without ownership', async () => {
    tracking.isRideParticipant.mockResolvedValue(false);
    const result = await gateway.handleRideChat(mockSocket() as never, {
      rideId: 'ride-9',
      senderId: 'spoof',
      text: 'hello',
    });
    expect(result).toEqual({ ok: false });
  });
});
