import { isMockOtpAllowed, MovaErrorCode, TEST_OTP_CODE, UserRole, UserStatus } from '@mova/shared';
import { AuthService } from './auth.service';
import { hashOtpCode } from './otp-code.util';
import { hashLocalPin } from './local-pin.util';
import { OWNER_SUPER_ADMIN_PHONE } from './partner-auth.util';

type GoogleStart = Awaited<ReturnType<AuthService['loginWithGoogle']>>;

function googleOtpChallenge(result: GoogleStart) {
  if (!('otpRequired' in result)) {
    throw new Error('expected Google OTP challenge, got a session JWT');
  }
  return result;
}

function googleSession(result: GoogleStart) {
  if (!('accessToken' in result)) {
    throw new Error('expected Google session JWT, got an OTP challenge');
  }
  return result;
}

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
  let mailer: { sendOtp: jest.Mock; isConfigured: jest.Mock };
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
    mailer = {
      sendOtp: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
      isConfigured: jest.fn().mockReturnValue(true),
    };
    service = new AuthService(
      prisma as never,
      jwt as never,
      { get: jest.fn() } as never,
      redis as never,
      sms as never,
      googleTokens as never,
      mailer as never,
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

  it('creates a pending DRIVER applicant on first driver-app OTP (not ACTIVE)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await seedHashedOtp('+243811111111', '847291');
    const created = makeUser({
      id: 'applicant-1',
      phone: '+243811111111',
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_KYC,
    });
    prisma.user.create.mockResolvedValue(created);
    const result = await service.verifyOtp('+243811111111', '847291', UserRole.DRIVER);
    expect(result.user.role).toBe(UserRole.DRIVER);
    expect(result.user.status).toBe(UserStatus.PENDING_KYC);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '+243811111111',
          role: UserRole.DRIVER,
          status: UserStatus.PENDING_KYC,
        }),
      }),
    );
  });

  it('sends DRIVER OTP when no chauffeur account exists yet', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.requestOtp('+243893515173', UserRole.DRIVER)).resolves.toMatchObject({
      success: true,
    });
    expect(prisma.otpCode.create).toHaveBeenCalled();
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

  it('flags needsPinSetup after phone OTP when no PIN is set', async () => {
    const passenger = makeUser({ phone: '+243812345678', localPinHash: null });
    prisma.user.findUnique.mockResolvedValue(passenger);
    await seedHashedOtp(passenger.phone);
    const result = await service.verifyOtp(passenger.phone, '847291', UserRole.PASSENGER);
    expect(result.needsPinSetup).toBe(true);
    expect(result.pinConfigured).toBe(false);
  });

  it('does not flag needsPinSetup for seed demo phones', async () => {
    const seed = makeUser({ phone: '+243900000010', localPinHash: null });
    prisma.user.findUnique.mockResolvedValue(seed);
    await seedHashedOtp(seed.phone);
    const result = await service.verifyOtp(seed.phone, '847291', UserRole.PASSENGER);
    expect(result.needsPinSetup).toBe(false);
  });

  it('allows an existing DRIVER on the driver app', async () => {
    const driver = makeUser({ role: UserRole.DRIVER, status: UserStatus.PENDING_KYC });
    prisma.user.findUnique.mockResolvedValue(driver);
    await seedHashedOtp(driver.phone);
    const result = await service.verifyOtp(driver.phone, '847291', UserRole.DRIVER);
    expect(result.user.role).toBe(UserRole.DRIVER);
    expect(result.pinConfigured).toBe(false);
    expect(result.needsPinSetup).toBe(true);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('creates RESTAURANT on first restaurant-portal OTP (explicit role)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await seedHashedOtp('+243811111111');
    const created = makeUser({ id: 'resto-1', role: UserRole.RESTAURANT });
    prisma.user.create.mockResolvedValue(created);
    const result = await service.verifyOtp('+243811111111', '847291', UserRole.RESTAURANT, 'restaurant');
    expect(result.isNew).toBe(true);
    expect(result.user.role).toBe(UserRole.RESTAURANT);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: '+243811111111', role: UserRole.RESTAURANT }),
      }),
    );
  });

  it('creates RENTAL_PARTNER from rental portal without repeating role', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await seedHashedOtp('+243822222222');
    const created = makeUser({
      id: 'rent-1',
      phone: '+243822222222',
      role: UserRole.RENTAL_PARTNER,
    });
    prisma.user.create.mockResolvedValue(created);
    const result = await service.verifyOtp('+243822222222', '847291', undefined, 'rental');
    expect(result.user.role).toBe(UserRole.RENTAL_PARTNER);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: UserRole.RENTAL_PARTNER }),
      }),
    );
  });

  it('does not create RESTAURANT from SENGA (no role / no portal)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await seedHashedOtp('+243811111111');
    const created = makeUser({ role: UserRole.PASSENGER });
    prisma.user.create.mockResolvedValue(created);
    await service.verifyOtp('+243811111111', '847291');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: UserRole.PASSENGER }),
      }),
    );
  });

  it('does not promote an existing PASSENGER to RESTAURANT', async () => {
    const passenger = makeUser({ role: UserRole.PASSENGER });
    prisma.user.findUnique.mockResolvedValue(passenger);
    await seedHashedOtp(passenger.phone);
    await expect(service.verifyOtp(passenger.phone, '847291', UserRole.RESTAURANT, 'restaurant')).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses SUPER_ADMIN phone self-register as RESTAURANT', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await seedHashedOtp(OWNER_SUPER_ADMIN_PHONE);
    await expect(
      service.verifyOtp(OWNER_SUPER_ADMIN_PHONE, '847291', UserRole.RESTAURANT, 'restaurant'),
    ).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects empty phone on OTP request with 400', async () => {
    await expect(service.requestOtp('')).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_INVALID_PHONE },
    });
    await expect(service.requestOtp(undefined as unknown as string)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_INVALID_PHONE },
    });
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('maps SMS provider throws to 503, not 500', async () => {
    sms.sendOtp.mockRejectedValue(new Error('hub exploded'));
    await expect(service.requestOtp('+243812345678')).rejects.toMatchObject({
      response: { code: MovaErrorCode.VALIDATION_ERROR, message: expect.stringMatching(/SMS/) },
    });
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
      expect.objectContaining({
        sub: passenger.id,
        role: UserRole.PASSENGER,
        needsPinSetup: true,
      }),
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

  it('allows first Google login on driver app (OTP challenge, no user yet)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const start = googleOtpChallenge(await service.loginWithGoogle('id-token', UserRole.DRIVER));
    expect(start.otpRequired).toBe(true);
    expect(start.challengeId).toEqual(expect.any(String));
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('creates a pending DRIVER after Google email OTP from the driver app', async () => {
    seedGoogleChallenge({ role: UserRole.DRIVER });
    await seedHashedOtp('new.user@gmail.com', '847291');
    const created = makeUser({
      id: 'g-driver',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_KYC,
    });
    prisma.user.create.mockResolvedValue(created);
    const result = await service.verifyGoogleOtp('challenge-1', '847291', UserRole.DRIVER);
    expect(result.isNew).toBe(true);
    expect(result.user.role).toBe(UserRole.DRIVER);
    expect(result.user.status).toBe(UserStatus.PENDING_KYC);
    expect(result.needsPhone).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          googleId: 'gid-new',
          role: UserRole.DRIVER,
          status: UserStatus.PENDING_KYC,
        }),
      }),
    );
  });

  it('does not promote PASSENGER to DRIVER via Google', async () => {
    const passenger = makeUser({
      role: UserRole.PASSENGER,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
    });
    prisma.user.findUnique.mockResolvedValue(passenger);
    await expect(service.loginWithGoogle('id-token', UserRole.DRIVER)).rejects.toMatchObject({
      response: {
        code: MovaErrorCode.AUTH_FORBIDDEN,
        message: expect.stringMatching(/compte passager/i),
      },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not create a DRIVER from SUPER_ADMIN Google on the driver app', async () => {
    const admin = makeUser({
      role: UserRole.SUPER_ADMIN,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
    });
    prisma.user.findUnique.mockResolvedValue(admin);
    await expect(service.loginWithGoogle('id-token', UserRole.DRIVER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('allows an existing DRIVER Google login on the driver app', async () => {
    const driver = makeUser({
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_KYC,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
    });
    prisma.user.findUnique.mockResolvedValue(driver);
    const start = googleOtpChallenge(await service.loginWithGoogle('id-token', UserRole.DRIVER));
    expect(start.otpRequired).toBe(true);
    expect(prisma.user.create).not.toHaveBeenCalled();

    seedGoogleChallenge({
      userId: driver.id,
      isNew: false,
      role: UserRole.DRIVER,
      destination: 'new.user@gmail.com',
      channel: 'email',
      email: 'new.user@gmail.com',
    });
    await seedHashedOtp('new.user@gmail.com', '847291');
    prisma.user.findUnique.mockResolvedValue(driver);
    prisma.user.update.mockResolvedValue(driver);
    const done = await service.verifyGoogleOtp('challenge-1', '847291', UserRole.DRIVER);
    expect(done.user.role).toBe(UserRole.DRIVER);
    expect(done.isNew).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(jwt.sign).toHaveBeenCalled();
  });

  it('allows first Google login on restaurant portal (OTP challenge, no JWT yet)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const start = googleOtpChallenge(await service.loginWithGoogle('id-token', UserRole.RESTAURANT, 'restaurant'));
    expect(start.otpRequired).toBe(true);
    expect(start.challengeId).toEqual(expect.any(String));
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('creates RESTAURANT after Google email OTP from restaurant portal', async () => {
    seedGoogleChallenge({ role: UserRole.RESTAURANT });
    await seedHashedOtp('new.user@gmail.com', '847291');
    const created = makeUser({
      id: 'g-resto',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      role: UserRole.RESTAURANT,
    });
    prisma.user.create.mockResolvedValue(created);
    const result = await service.verifyGoogleOtp('challenge-1', '847291', UserRole.RESTAURANT, 'restaurant');
    expect(result.isNew).toBe(true);
    expect(result.user.role).toBe(UserRole.RESTAURANT);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ googleId: 'gid-new', role: UserRole.RESTAURANT }),
      }),
    );
  });

  it('creates RESTAURANT from intendedRole alone (no portal field)', async () => {
    seedGoogleChallenge({ role: undefined });
    await seedHashedOtp('new.user@gmail.com', '847291');
    const created = makeUser({
      id: 'g-resto-hint',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      role: UserRole.RESTAURANT,
    });
    prisma.user.create.mockResolvedValue(created);
    const result = await service.verifyGoogleOtp(
      'challenge-1',
      '847291',
      undefined,
      undefined,
      'RESTAURANT',
    );
    expect(result.user.role).toBe(UserRole.RESTAURANT);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: UserRole.RESTAURANT }),
      }),
    );
  });

  it('ignores intendedRole SUPER_ADMIN (cannot mint staff)', async () => {
    seedGoogleChallenge({ role: undefined });
    await seedHashedOtp('new.user@gmail.com', '847291');
    const created = makeUser({
      id: 'g-user',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      role: UserRole.PASSENGER,
    });
    prisma.user.create.mockResolvedValue(created);
    await service.verifyGoogleOtp('challenge-1', '847291', undefined, undefined, 'SUPER_ADMIN');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: UserRole.PASSENGER }),
      }),
    );
  });

  it('does not create RESTAURANT from Google on SENGA (no portal)', async () => {
    seedGoogleChallenge({ role: UserRole.PASSENGER });
    await seedHashedOtp('new.user@gmail.com', '847291');
    const created = makeUser({
      id: 'g-user',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      role: UserRole.PASSENGER,
    });
    prisma.user.create.mockResolvedValue(created);
    await service.verifyGoogleOtp('challenge-1', '847291');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: UserRole.PASSENGER }),
      }),
    );
  });

  function seedGoogleChallenge(overrides: Record<string, unknown> = {}) {
    const challenge = {
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      givenName: 'Marie',
      familyName: 'Kabila',
      picture: null,
      userId: null,
      isNew: true,
      role: UserRole.PASSENGER,
      destination: 'new.user@gmail.com',
      channel: 'email',
      ...overrides,
    };
    redis.client.get.mockResolvedValue(JSON.stringify(challenge));
    return challenge;
  }

  it('Google-only login sends email OTP and does not issue JWT yet', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const result = googleOtpChallenge(await service.loginWithGoogle('id-token', UserRole.PASSENGER));
    expect(result.otpRequired).toBe(true);
    expect(result.otpChannel).toBe('email');
    expect(result.challengeId).toEqual(expect.any(String));
    expect(result).not.toHaveProperty('accessToken');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
    expect(prisma.otpCode.create).toHaveBeenCalled();
    expect(sms.sendOtp).not.toHaveBeenCalled();
    if (isMockOtpAllowed()) {
      expect(mailer.sendOtp).not.toHaveBeenCalled();
    } else {
      expect(mailer.sendOtp).toHaveBeenCalledWith('new.user@gmail.com', expect.any(String));
    }
  });

  it('completes Google-only login after email OTP — creates PASSENGER and JWT', async () => {
    seedGoogleChallenge();
    await seedHashedOtp('new.user@gmail.com', '847291');
    const created = makeUser({
      id: 'g-user',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      firstName: 'Marie',
    });
    prisma.user.create.mockResolvedValue(created);
    const result = await service.verifyGoogleOtp('challenge-1', '847291', UserRole.PASSENGER);
    expect(result.isNew).toBe(true);
    expect(result.accessToken).toBe('jwt-token');
    expect(result.user.id).toBe('g-user');
    expect(result.user.role).toBe(UserRole.PASSENGER);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          googleId: 'gid-new',
          role: UserRole.PASSENGER,
        }),
      }),
    );
    expect(result.needsPinSetup).toBe(true);
    expect(result.pinConfigured).toBe(false);
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'g-user', role: UserRole.PASSENGER, needsPinSetup: true }),
      expect.objectContaining({ jwtid: expect.any(String) }),
    );
  });

  it('flags needsPinSetup after Google-only login even without a phone', async () => {
    seedGoogleChallenge();
    await seedHashedOtp('new.user@gmail.com', '847291');
    const created = makeUser({
      id: 'g-pin',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      localPinHash: null,
    });
    prisma.user.create.mockResolvedValue(created);
    const result = await service.verifyGoogleOtp('challenge-1', '847291', UserRole.PASSENGER);
    expect(result.needsPinSetup).toBe(true);
    expect(result.needsPhone).toBe(true);
    expect(result.user.hasPhone).toBe(false);
  });

  it('resolves PIN login options by remembered Google email', async () => {
    const googleOnly = makeUser({
      id: 'g-user',
      phone: null,
      email: 'marie@gmail.com',
      googleId: 'gid-new',
      localPinHash: hashLocalPin('847291'),
    });
    prisma.user.findFirst.mockResolvedValue(googleOnly);
    const options = await service.getLoginOptions('marie@gmail.com', UserRole.PASSENGER);
    expect(options.pinEnabled).toBe(true);
    const session = await service.loginWithPin('marie@gmail.com', '847291', UserRole.PASSENGER);
    expect(session.pinConfigured).toBe(true);
    expect(session.needsPinSetup).toBe(false);
    expect(session.user.email).toBe('marie@gmail.com');
  });

  it('Google login of a phone user sends email OTP (not SMS) and keeps the same userId after verify', async () => {
    const existing = makeUser({
      id: 'phone-user',
      phone: '+243811111111',
      googleId: 'gid-new',
      email: 'marie@gmail.com',
    });
    prisma.user.findUnique.mockResolvedValue(existing);
    const start = googleOtpChallenge(await service.loginWithGoogle('id-token', UserRole.PASSENGER));
    expect(start.otpRequired).toBe(true);
    expect(start.otpChannel).toBe('email');
    expect(start).not.toHaveProperty('accessToken');
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    if (!isMockOtpAllowed()) {
      expect(mailer.sendOtp).toHaveBeenCalledWith('new.user@gmail.com', expect.any(String));
    }

    seedGoogleChallenge({
      userId: existing.id,
      isNew: false,
      destination: 'new.user@gmail.com',
      channel: 'email',
      email: 'new.user@gmail.com',
    });
    await seedHashedOtp('new.user@gmail.com', '847291');
    prisma.user.findUnique.mockResolvedValue(existing);
    prisma.user.update.mockResolvedValue(existing);
    const done = await service.verifyGoogleOtp('challenge-1', '847291', UserRole.PASSENGER);
    expect(done.user.id).toBe('phone-user');
    expect(done.isNew).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('attaches Google to an existing phone user after OTP when emails match — same userId', async () => {
    const existing = makeUser({ id: 'email-match', email: 'marie@gmail.com', googleId: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(existing);
    googleTokens.verify.mockResolvedValue({
      googleId: 'gid-new',
      email: 'marie@gmail.com',
      emailVerified: true,
      givenName: 'Marie',
      familyName: null,
      picture: null,
      audience: 'web',
    });
    const start = googleOtpChallenge(await service.loginWithGoogle('id-token', UserRole.PASSENGER));
    expect(start.otpChannel).toBe('email');
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();

    seedGoogleChallenge({
      userId: existing.id,
      isNew: false,
      destination: 'marie@gmail.com',
      channel: 'email',
      email: 'marie@gmail.com',
    });
    await seedHashedOtp('marie@gmail.com', '847291');
    prisma.user.findUnique.mockResolvedValue(existing);
    prisma.user.update.mockResolvedValue({ ...existing, googleId: 'gid-new' });
    const done = await service.verifyGoogleOtp('challenge-1', '847291', UserRole.PASSENGER);
    expect(done.user.id).toBe('email-match');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.objectContaining({ googleId: 'gid-new' }),
      }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('completes Google login when email OTP cannot be sent (verified Google email)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    mailer.sendOtp.mockResolvedValue({ success: false, message: 'SMTP missing' });
    if (isMockOtpAllowed()) {
      const result = googleOtpChallenge(await service.loginWithGoogle('id-token', UserRole.PASSENGER));
      expect(result.otpRequired).toBe(true);
      expect(jwt.sign).not.toHaveBeenCalled();
      return;
    }
    const created = makeUser({
      id: 'g-user',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
    });
    prisma.user.create.mockResolvedValue(created);
    const result = googleSession(await service.loginWithGoogle('id-token', UserRole.PASSENGER));
    expect(result.accessToken).toBe('jwt-token');
    expect(result).not.toHaveProperty('otpRequired');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ googleId: 'gid-new', role: UserRole.PASSENGER }),
      }),
    );
  });

  it('links allowlisted Google email to existing SUPER_ADMIN without creating a second admin', async () => {
    const owner = makeUser({
      id: 'owner-1',
      phone: OWNER_SUPER_ADMIN_PHONE,
      role: UserRole.SUPER_ADMIN,
      email: null,
      googleId: null,
    });
    googleTokens.verify.mockResolvedValue({
      googleId: 'gid-owner',
      email: 'celestinkas@gmail.com',
      emailVerified: true,
      givenName: 'Celestin',
      familyName: 'Kas',
      picture: null,
      audience: 'web',
    });
    prisma.user.findUnique.mockImplementation(({ where }: { where: { googleId?: string; phone?: string } }) => {
      if (where.phone === OWNER_SUPER_ADMIN_PHONE) return Promise.resolve(owner);
      return Promise.resolve(null);
    });
    const start = googleOtpChallenge(await service.loginWithGoogle('id-token', UserRole.ADMIN));
    expect(start.otpRequired).toBe(true);
    expect(start.otpChannel).toBe('email');
    expect(sms.sendOtp).not.toHaveBeenCalled();
    if (!isMockOtpAllowed()) {
      expect(mailer.sendOtp).toHaveBeenCalledWith('celestinkas@gmail.com', expect.any(String));
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('issues SUPER_ADMIN JWT when owner Google email OTP cannot be sent', async () => {
    const owner = makeUser({
      id: 'owner-1',
      phone: OWNER_SUPER_ADMIN_PHONE,
      role: UserRole.SUPER_ADMIN,
      email: null,
      googleId: null,
    });
    googleTokens.verify.mockResolvedValue({
      googleId: 'gid-owner',
      email: 'celestinkas@gmail.com',
      emailVerified: true,
      givenName: 'Celestin',
      familyName: 'Kas',
      picture: null,
      audience: 'web',
    });
    prisma.user.findUnique.mockImplementation(({ where }: { where: { googleId?: string; phone?: string; id?: string } }) => {
      if (where.phone === OWNER_SUPER_ADMIN_PHONE) return Promise.resolve(owner);
      if (where.id === owner.id) return Promise.resolve(owner);
      return Promise.resolve(null);
    });
    prisma.user.update.mockResolvedValue({ ...owner, googleId: 'gid-owner', email: 'celestinkas@gmail.com' });
    mailer.sendOtp.mockResolvedValue({ success: false, message: 'SMTP missing' });
    if (isMockOtpAllowed()) {
      const result = googleOtpChallenge(await service.loginWithGoogle('id-token', UserRole.ADMIN));
      expect(result.otpRequired).toBe(true);
      expect(result.otpChannel).toBe('email');
      expect(prisma.user.create).not.toHaveBeenCalled();
      return;
    }
    const result = googleSession(await service.loginWithGoogle('id-token', UserRole.ADMIN));
    expect(result.accessToken).toBe('jwt-token');
    expect(result.user.role).toBe(UserRole.SUPER_ADMIN);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('allows owner SUPER_ADMIN Google on the restaurant portal (email OTP, same account)', async () => {
    const owner = makeUser({
      id: 'owner-1',
      phone: OWNER_SUPER_ADMIN_PHONE,
      role: UserRole.SUPER_ADMIN,
      email: 'celestinkas@gmail.com',
      googleId: null,
    });
    googleTokens.verify.mockResolvedValue({
      googleId: 'gid-owner',
      email: 'celestinkas@gmail.com',
      emailVerified: true,
      givenName: 'Celestin',
      familyName: 'Kas',
      picture: null,
      audience: 'web',
    });
    prisma.user.findUnique.mockImplementation(({ where }: { where: { googleId?: string; phone?: string } }) => {
      if (where.phone === OWNER_SUPER_ADMIN_PHONE) return Promise.resolve(owner);
      return Promise.resolve(null);
    });
    prisma.user.findFirst.mockResolvedValue(owner);
    const start = googleOtpChallenge(await service.loginWithGoogle('id-token', UserRole.RESTAURANT, 'restaurant'));
    expect(start.otpRequired).toBe(true);
    expect(start.otpChannel).toBe('email');
    expect(sms.sendOtp).not.toHaveBeenCalled();
    if (!isMockOtpAllowed()) {
      expect(mailer.sendOtp).toHaveBeenCalledWith('celestinkas@gmail.com', expect.any(String));
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('does not auto-register owner Gmail as a new RESTAURANT when the SUPER_ADMIN row is missing', async () => {
    googleTokens.verify.mockResolvedValue({
      googleId: 'gid-owner',
      email: 'celestinkas@gmail.com',
      emailVerified: true,
      givenName: 'Celestin',
      familyName: 'Kas',
      picture: null,
      audience: 'web',
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.loginWithGoogle('id-token', UserRole.RESTAURANT, 'restaurant'),
    ).rejects.toMatchObject({
      response: {
        code: MovaErrorCode.AUTH_FORBIDDEN,
        message: 'Ce compte est déjà administrateur. Utilisez un autre e-mail pour le resto.',
      },
    });
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
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

  it('linkGoogle attaches to a phone-first pending DRIVER without creating a second user', async () => {
    const driver = makeUser({
      id: 'drv-1',
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_KYC,
    });
    prisma.user.findUnique.mockResolvedValue(driver);
    prisma.user.update.mockResolvedValue({
      ...driver,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
    });
    const result = await service.linkGoogle(driver.id, 'id-token');
    expect(result.user.role).toBe(UserRole.DRIVER);
    expect(result.user.status).toBe(UserStatus.PENDING_KYC);
    expect(result.user.googleLinked).toBe(true);
    expect(result.user.hasPhone).toBe(true);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('linkGoogle attaches to an ACTIVE DRIVER without changing role', async () => {
    const driver = makeUser({
      id: 'drv-active',
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
    });
    prisma.user.findUnique.mockResolvedValue(driver);
    prisma.user.update.mockResolvedValue({ ...driver, googleId: 'gid-new' });
    const result = await service.linkGoogle(driver.id, 'id-token');
    expect(result.user.role).toBe(UserRole.DRIVER);
    expect(result.user.status).toBe(UserStatus.ACTIVE);
    expect(prisma.user.create).not.toHaveBeenCalled();
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

  it('linkPhone attaches +243 to a Google-first pending DRIVER without creating a user', async () => {
    const driver = makeUser({
      id: 'drv-g',
      phone: null,
      googleId: 'gid-new',
      email: 'driver@gmail.com',
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_KYC,
    });
    await seedHashedOtp('+243812345678', '847291');
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id?: string; phone?: string } }) => {
      if (where.id === 'drv-g') return Promise.resolve(driver);
      if (where.phone === '+243812345678') return Promise.resolve(null);
      return Promise.resolve(null);
    });
    prisma.user.update.mockResolvedValue({ ...driver, phone: '+243812345678' });
    const result = await service.linkPhone(driver.id, '+243812345678', '847291');
    expect(result.user.hasPhone).toBe(true);
    expect(result.user.googleLinked).toBe(true);
    expect(result.user.role).toBe(UserRole.DRIVER);
    expect(result.user.status).toBe(UserStatus.PENDING_KYC);
    expect(result.needsPinSetup).toBe(true);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('linkGoogle on DRIVER rejects a Gmail already used by a PASSENGER', async () => {
    const driver = makeUser({
      id: 'drv-1',
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_KYC,
    });
    const passenger = makeUser({
      id: 'pax-1',
      phone: '+243822222222',
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      role: UserRole.PASSENGER,
    });
    prisma.user.findUnique
      .mockResolvedValueOnce(driver)
      .mockResolvedValueOnce(passenger);
    await expect(service.linkGoogle(driver.id, 'id-token')).rejects.toMatchObject({
      response: {
        code: MovaErrorCode.AUTH_IDENTITY_TAKEN,
        message: 'Cet e-mail Google est déjà lié à un autre compte SENGA.',
      },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
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

  it('unlinkPhone refuses to detach the owner SUPER_ADMIN number', async () => {
    const owner = makeUser({
      id: 'owner-1',
      phone: OWNER_SUPER_ADMIN_PHONE,
      googleId: 'gid-owner',
      role: UserRole.SUPER_ADMIN,
    });
    prisma.user.findUnique.mockResolvedValue(owner);
    await expect(service.unlinkPhone(owner.id)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('unlinkGoogle succeeds when a phone remains (no role change)', async () => {
    const both = makeUser({ googleId: 'gid-new', phone: '+243811111111', role: UserRole.PASSENGER });
    prisma.user.findUnique.mockResolvedValue(both);
    prisma.user.update.mockResolvedValue({ ...both, googleId: null });
    const result = await service.unlinkGoogle(both.id);
    expect(result.user.googleLinked).toBe(false);
    expect(result.user.hasPhone).toBe(true);
    expect(result.user.role).toBe(UserRole.PASSENGER);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: both.id },
        data: { googleId: null },
      }),
    );
  });
});
