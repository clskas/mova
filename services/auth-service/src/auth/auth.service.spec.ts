import { MovaErrorCode, TEST_OTP_CODE, UserRole, UserStatus } from '@mova/shared';
import { AuthService } from './auth.service';
import { hashOtpCode } from './otp-code.util';
import { hashLocalPin } from './local-pin.util';
import { OWNER_SUPER_ADMIN_PHONE } from './partner-auth.util';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    phone: '+243811111111',
    role: UserRole.PASSENGER,
    status: UserStatus.ACTIVE,
    firstName: null,
    lastName: null,
    email: null,
    googleId: null,
    localPinHash: null,
    localPinSetAt: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: {
    otpCode: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let jwt: { sign: jest.Mock };
  let googleTokens: { verify: jest.Mock };
  let redis: {
    publish: jest.Mock;
    client: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  };
  let sms: { sendOtp: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      otpCode: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'otp-1' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('jwt-token') };
    googleTokens = {
      verify: jest.fn().mockResolvedValue({
        googleId: 'gid-new',
        email: 'new.user@gmail.com',
        emailVerified: true,
        givenName: 'Marie',
        familyName: 'Kabila',
        picture: null,
        audience: 'web-client.apps.googleusercontent.com',
      }),
    };
    redis = {
      publish: jest.fn().mockResolvedValue(undefined),
      client: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      },
    };
    sms = { sendOtp: jest.fn().mockResolvedValue({ success: true, message: 'ok' }) };
    service = new AuthService(
      prisma as never,
      jwt as never,
      { get: jest.fn() } as never,
      redis as never,
      sms as never,
      googleTokens as never,
    );
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as jest.Mock;
  });

  async function seedHashedOtp(phone: string, code = '847291') {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp-1',
      phone,
      code: hashOtpCode(code),
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
  }

  it('does not silently promote PASSENGER to DRIVER on OTP', async () => {
    const passenger = makeUser({ role: UserRole.PASSENGER });
    prisma.user.findUnique.mockResolvedValue(passenger);
    await seedHashedOtp(passenger.phone);
    await expect(service.verifyOtp(passenger.phone, '847291', UserRole.DRIVER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not grant DRIVER just from OTP body role', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await seedHashedOtp('+243811111111', '847291');
    await expect(service.verifyOtp('+243811111111', '847291', UserRole.DRIVER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('allows SUPER_ADMIN on the passenger app without changing role', async () => {
    const admin = makeUser({
      id: 'owner-1',
      phone: OWNER_SUPER_ADMIN_PHONE,
      role: UserRole.SUPER_ADMIN,
    });
    prisma.user.findUnique.mockResolvedValue(admin);
    await seedHashedOtp(admin.phone, '847291');
    const result = await service.verifyOtp(admin.phone, '847291', UserRole.PASSENGER);
    expect(result.user.role).toBe(UserRole.SUPER_ADMIN);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(jwt.sign).toHaveBeenCalled();
  });

  it('allows an existing DRIVER on the driver app', async () => {
    const driver = makeUser({ role: UserRole.DRIVER, status: UserStatus.PENDING_KYC });
    prisma.user.findUnique.mockResolvedValue(driver);
    await seedHashedOtp(driver.phone);
    const result = await service.verifyOtp(driver.phone, '847291', UserRole.DRIVER);
    expect(result.user.role).toBe(UserRole.DRIVER);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses new RESTAURANT self-register from OTP body', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await seedHashedOtp('+243811111111');
    await expect(service.verifyOtp('+243811111111', '847291', UserRole.RESTAURANT)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('looks up OTP by SHA-256 hash, not plaintext', async () => {
    const passenger = makeUser();
    prisma.user.findUnique.mockResolvedValue(passenger);
    await seedHashedOtp(passenger.phone, '847291');
    await service.verifyOtp(passenger.phone, '847291', UserRole.PASSENGER);
    expect(prisma.otpCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ code: hashOtpCode('847291') }),
      }),
    );
  });

  it('invalidates previous unused OTP codes on request', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await service.requestOtp('+243812345678');
    expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
      where: { phone: '+243812345678', used: false },
      data: { used: true },
    });
    const created = prisma.otpCode.create.mock.calls[0][0];
    expect(created.data.code).toMatch(/^[a-f0-9]{64}$/);
    expect(created.data.code).not.toBe(TEST_OTP_CODE);
  });

  it('stores hashed 123456 for seed phones', async () => {
    await service.requestOtp('+243900000010');
    expect(prisma.otpCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: hashOtpCode(TEST_OTP_CODE) }),
      }),
    );
  });

  it('locks OTP after 5 failed verifies', async () => {
    redis.client.get.mockResolvedValue('5');
    await expect(service.verifyOtp('+243812345678', '000000')).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
  });

  it('issues JWT with a jti (jwtid) for denylist logout', async () => {
    const passenger = makeUser();
    prisma.user.findUnique.mockResolvedValue(passenger);
    await seedHashedOtp(passenger.phone);
    await service.verifyOtp(passenger.phone, '847291', UserRole.PASSENGER);
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: passenger.id, role: UserRole.PASSENGER }),
      expect.objectContaining({ jwtid: expect.any(String) }),
    );
  });

  it('denylists jti on logout', async () => {
    const result = await service.logout('jti-logout-1');
    expect(result).toEqual({ success: true, revoked: true });
    expect(redis.client.set).toHaveBeenCalled();
  });

  it('fail-closes logout when Redis is down', async () => {
    redis.client.set.mockRejectedValue(new Error('redis down'));
    await expect(service.logout('jti-logout-1')).rejects.toMatchObject({
      response: { code: MovaErrorCode.INTERNAL_ERROR },
    });
  });

  it('fail-opens OTP lock when Redis is down', async () => {
    redis.client.get.mockRejectedValue(new Error('redis asleep'));
    const passenger = makeUser({ phone: '+243812345678' });
    prisma.user.findUnique.mockResolvedValue(passenger);
    await seedHashedOtp(passenger.phone);
    const result = await service.verifyOtp(passenger.phone, '847291', UserRole.PASSENGER);
    expect(result.success).toBe(true);
  });

  it('does not create an admin from a random Google account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.loginWithGoogle('id-token', UserRole.ADMIN)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('does not create a DRIVER from Google', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.loginWithGoogle('id-token', UserRole.DRIVER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a PASSENGER on first Google login when email is new', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const created = makeUser({
      id: 'g-user',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      firstName: 'Marie',
    });
    prisma.user.create.mockResolvedValue(created);
    const result = await service.loginWithGoogle('id-token', UserRole.PASSENGER);
    expect(result.isNew).toBe(true);
    expect(result.user.role).toBe(UserRole.PASSENGER);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          googleId: 'gid-new',
          role: UserRole.PASSENGER,
        }),
      }),
    );
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'g-user', role: UserRole.PASSENGER }),
      expect.objectContaining({ jwtid: expect.any(String) }),
    );
  });

  it('attaches Google to an existing phone user when emails match', async () => {
    const existing = makeUser({ email: 'marie@gmail.com' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(existing);
    prisma.user.update.mockResolvedValue({ ...existing, googleId: 'gid-new' });
    googleTokens.verify.mockResolvedValue({
      googleId: 'gid-new',
      email: 'marie@gmail.com',
      emailVerified: true,
      givenName: 'Marie',
      familyName: null,
      picture: null,
      audience: 'web',
    });
    const result = await service.loginWithGoogle('id-token', UserRole.PASSENGER);
    expect(result.isNew).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.objectContaining({ googleId: 'gid-new' }),
      }),
    );
  });

  it('rejects a Google token the verifier refuses (bad audience)', async () => {
    googleTokens.verify.mockRejectedValue({
      response: { code: MovaErrorCode.AUTH_INVALID_GOOGLE },
    });
    await expect(service.loginWithGoogle('bad-token', UserRole.PASSENGER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_INVALID_GOOGLE },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses PIN login of a PASSENGER on the driver app', async () => {
    const pin = '847291';
    const passenger = makeUser({ localPinHash: hashLocalPin(pin) });
    prisma.user.findUnique.mockResolvedValue(passenger);
    await expect(service.loginWithPin(passenger.phone, pin, UserRole.DRIVER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
  });

  it('linkGoogle attaches to the current phone user without changing role', async () => {
    const passenger = makeUser({ role: UserRole.PASSENGER });
    prisma.user.findUnique.mockResolvedValue(passenger);
    prisma.user.update.mockResolvedValue({ ...passenger, googleId: 'gid-new', email: 'new.user@gmail.com' });
    const result = await service.linkGoogle(passenger.id, 'id-token');
    expect(result.user.role).toBe(UserRole.PASSENGER);
    expect(result.user.googleLinked).toBe(true);
    expect(result.message).toContain('Compte lié');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: passenger.id },
        data: expect.objectContaining({ googleId: 'gid-new' }),
      }),
    );
  });

  it('linkGoogle on SUPER_ADMIN keeps SUPER_ADMIN (no second admin)', async () => {
    const admin = makeUser({
      id: 'owner-1',
      phone: OWNER_SUPER_ADMIN_PHONE,
      role: UserRole.SUPER_ADMIN,
    });
    prisma.user.findUnique.mockResolvedValue(admin);
    prisma.user.update.mockResolvedValue({ ...admin, googleId: 'gid-new' });
    const result = await service.linkGoogle(admin.id, 'id-token');
    expect(result.user.role).toBe(UserRole.SUPER_ADMIN);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('linkGoogle rejects a googleId already used by another user', async () => {
    const current = makeUser({ id: 'me' });
    const other = makeUser({ id: 'other', googleId: 'gid-new', phone: '+243822222222' });
    prisma.user.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(other);
    await expect(service.linkGoogle(current.id, 'id-token')).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_IDENTITY_TAKEN },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('linkPhone attaches +243 to a Google-only user', async () => {
    const googleOnly = makeUser({ id: 'g-user', phone: null, googleId: 'gid-new' });
    await seedHashedOtp('+243812345678', '847291');
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id?: string; phone?: string } }) => {
      if (where.id === 'g-user') return Promise.resolve(googleOnly);
      if (where.phone === '+243812345678') return Promise.resolve(null);
      return Promise.resolve(null);
    });
    prisma.user.update.mockResolvedValue({ ...googleOnly, phone: '+243812345678' });
    const result = await service.linkPhone(googleOnly.id, '+243812345678', '847291');
    expect(result.user.hasPhone).toBe(true);
    expect(result.user.role).toBe(UserRole.PASSENGER);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('linkPhone rejects a phone already used by another user', async () => {
    const googleOnly = makeUser({ id: 'g-user', phone: null, googleId: 'gid-new' });
    const other = makeUser({ id: 'other', phone: '+243812345678' });
    await seedHashedOtp('+243812345678', '847291');
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id?: string; phone?: string } }) => {
      if (where.id === 'g-user') return Promise.resolve(googleOnly);
      if (where.phone === '+243812345678') return Promise.resolve(other);
      return Promise.resolve(null);
    });
    await expect(service.linkPhone(googleOnly.id, '+243812345678', '847291')).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_IDENTITY_TAKEN },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('unlinkGoogle refuses to leave a user with neither phone nor Google', async () => {
    const googleOnly = makeUser({ id: 'g-user', phone: null, googleId: 'gid-new' });
    prisma.user.findUnique.mockResolvedValue(googleOnly);
    await expect(service.unlinkGoogle(googleOnly.id)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('unlinkPhone refuses to leave a user with neither phone nor Google', async () => {
    const phoneOnly = makeUser();
    prisma.user.findUnique.mockResolvedValue(phoneOnly);
    await expect(service.unlinkPhone(phoneOnly.id)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
