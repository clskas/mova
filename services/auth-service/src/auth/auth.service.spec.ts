import { MovaErrorCode, TEST_OTP_CODE, UserRole, UserStatus } from '@mova/shared';
import { AuthService } from './auth.service';
import { hashOtpCode } from './otp-code.util';
import { hashLocalPin } from './local-pin.util';
import { OWNER_SUPER_ADMIN_PHONE } from './partner-auth.util';

type GoogleStart = Awaited<ReturnType<AuthService['loginWithGoogle']>>;

function googleSession(result: GoogleStart) {
  if (!('accessToken' in result)) {
    throw new Error('expected Google session JWT');
  }
  return result;
}

function googleEmailOtp(result: GoogleStart) {
  if (!('otpRequired' in result) || result.otpRequired !== true) {
    throw new Error('expected Google email OTP challenge');
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
  let sms: { sendOtp: jest.Mock; sendSms: jest.Mock };
  let mailer: { sendOtp: jest.Mock; sendLoginPin: jest.Mock; sendNotice: jest.Mock; isConfigured: jest.Mock };
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
    sms = {
      sendOtp: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
      sendSms: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    };
    mailer = {
      sendOtp: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
      sendLoginPin: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
      sendNotice: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
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

  it('surfaces hub rate-limit instead of a generic retry-later SMS line', async () => {
    sms.sendOtp.mockResolvedValue({ success: false, message: 'OTP cooldown active' });
    await expect(service.requestOtp('+243812345678')).rejects.toMatchObject({
      response: {
        code: MovaErrorCode.VALIDATION_ERROR,
        message: 'Trop de codes envoyés vers ce numéro. Réessayez dans une minute.',
      },
    });
  });

  it('keeps a generic SMS line when the hub leaks HMAC / English', async () => {
    sms.sendOtp.mockResolvedValue({ success: false, message: 'Invalid HMAC signature' });
    await expect(service.requestOtp('+243812345678')).rejects.toMatchObject({
      response: {
        code: MovaErrorCode.VALIDATION_ERROR,
        message: expect.stringMatching(/Impossible d'envoyer le code par SMS/),
      },
    });
  });

  it('maps the live SerdiPay 400 wrapper to French instead of leaking (400)', async () => {
    sms.sendOtp.mockResolvedValue({
      success: false,
      message: 'Échec SMS SerdiPay (400): An error occor while processing the sms',
    });
    await expect(service.requestOtp('+243978685317', UserRole.RESTAURANT, 'restaurant')).rejects.toMatchObject({
      response: {
        code: MovaErrorCode.VALIDATION_ERROR,
        message: expect.stringMatching(/SerdiPay a refusé l'envoi SMS/),
      },
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

  it('refuses Play pre-launch virtual Gmail auto-register (passenger and driver)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    googleTokens.verify.mockResolvedValue({
      googleId: 'gid-play',
      email: 'martinpearson.39569@gmail.com',
      emailVerified: true,
      givenName: 'Martin',
      familyName: 'Pearson',
      picture: null,
      audience: 'web-client.apps.googleusercontent.com',
    });
    await expect(service.loginWithGoogle('id-token', UserRole.PASSENGER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN, message: expect.stringMatching(/Play|Test Lab/i) },
    });
    await expect(service.loginWithGoogle('id-token', UserRole.DRIVER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN, message: expect.stringMatching(/Play|Test Lab|\+243/i) },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(mailer.sendOtp).not.toHaveBeenCalled();
  });

  it('refuses Cloud Test Lab mailbox auto-register on the driver app', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    googleTokens.verify.mockResolvedValue({
      googleId: 'gid-lab',
      email: 'aqwza7hpyxgwc3pve4yeil-lvl-02@cloudtestlabaccounts.com',
      emailVerified: true,
      givenName: 'Nuage',
      familyName: 'Laboratoire',
      picture: null,
      audience: 'android-client.apps.googleusercontent.com',
    });
    await expect(service.loginWithGoogle('id-token', UserRole.DRIVER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('still sends SMS OTP for a real +243 when linking a phone (same path as login)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.requestOtp('+243812345678')).resolves.toMatchObject({
      success: true,
      phone: '+243812345678',
    });
    expect(sms.sendOtp).toHaveBeenCalledWith('+243812345678', expect.any(String));
  });

  it('allows first Google login on driver app (session JWT, no email OTP)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const created = makeUser({
      id: 'g-driver',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_KYC,
    });
    prisma.user.create.mockResolvedValue(created);
    const result = googleSession(await service.loginWithGoogle('id-token', UserRole.DRIVER));
    expect(result.isNew).toBe(true);
    expect(result.accessToken).toBe('jwt-token');
    expect(result.user.role).toBe(UserRole.DRIVER);
    expect(prisma.user.create).toHaveBeenCalled();
    expect(mailer.sendOtp).not.toHaveBeenCalled();
    expect(sms.sendOtp).not.toHaveBeenCalled();
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
    prisma.user.update.mockResolvedValue(driver);
    const done = googleSession(await service.loginWithGoogle('id-token', UserRole.DRIVER));
    expect(done.user.role).toBe(UserRole.DRIVER);
    expect(done.isNew).toBe(false);
    expect(done.accessToken).toBe('jwt-token');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(jwt.sign).toHaveBeenCalled();
    expect(mailer.sendOtp).not.toHaveBeenCalled();
    expect(sms.sendOtp).not.toHaveBeenCalled();
  });

  it('sends Google email OTP on first restaurant portal login (no session JWT yet)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const result = googleEmailOtp(await service.loginWithGoogle('id-token', UserRole.RESTAURANT, 'restaurant'));
    expect(result.otpRequired).toBe(true);
    expect(result.otpChannel).toBe('email');
    expect(result.challengeId).toEqual(expect.any(String));
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
    expect(mailer.sendOtp).toHaveBeenCalledWith(
      'new.user@gmail.com',
      expect.any(String),
      expect.objectContaining({ portal: 'restaurant' }),
    );
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(redis.client.set).toHaveBeenCalled();
  });

  it('sends Google email OTP on first rental portal login', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const result = googleEmailOtp(await service.loginWithGoogle('id-token', UserRole.RENTAL_PARTNER, 'rental'));
    expect(result.otpRequired).toBe(true);
    expect(mailer.sendOtp).toHaveBeenCalledWith(
      'new.user@gmail.com',
      expect.any(String),
      expect.objectContaining({ portal: 'rental' }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('sends Google email OTP on restaurant portal even if a KYC login PIN already exists', async () => {
    const resto = makeUser({
      id: 'g-resto',
      phone: null,
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      role: UserRole.RESTAURANT,
      localPinHash: hashLocalPin('847291'),
    });
    prisma.user.findUnique.mockResolvedValue(resto);
    const result = googleEmailOtp(await service.loginWithGoogle('id-token', UserRole.RESTAURANT, 'restaurant'));
    expect(result.otpRequired).toBe(true);
    expect(jwt.sign).not.toHaveBeenCalled();
    expect(mailer.sendOtp).toHaveBeenCalledWith(
      'new.user@gmail.com',
      expect.any(String),
      expect.objectContaining({ portal: 'restaurant' }),
    );
    expect(sms.sendOtp).not.toHaveBeenCalled();
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

  it('Google-only login issues JWT without email OTP', async () => {
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
    const result = googleSession(await service.loginWithGoogle('id-token', UserRole.PASSENGER));
    expect(result.accessToken).toBe('jwt-token');
    expect(result.isNew).toBe(true);
    expect(result).not.toHaveProperty('otpRequired');
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(mailer.sendOtp).not.toHaveBeenCalled();
    expect(sms.sendOtp).not.toHaveBeenCalled();
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

  it('treats a handle with @ as e-mail, not a phone (even without a dot)', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.loginWithPin('marie@gmailcom', '847291', UserRole.PASSENGER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_PIN_NOT_SET },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects garbage PIN login handles that are neither +243 nor e-mail', async () => {
    await expect(service.loginWithPin('not-a-phone', '847291', UserRole.PASSENGER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_INVALID_PHONE },
    });
    await expect(service.loginWithPin('+243', '847291', UserRole.PASSENGER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_INVALID_PHONE },
    });
  });

  it('logs in with PIN by userId for a Google-only account', async () => {
    const googleOnly = makeUser({
      id: 'a1b2c3d4-e5f6-47a8-9abc-def012345678',
      phone: null,
      email: 'marie@gmail.com',
      googleId: 'gid-new',
      localPinHash: hashLocalPin('847291'),
    });
    prisma.user.findUnique.mockResolvedValue(googleOnly);
    const session = await service.loginWithPin(
      undefined,
      '847291',
      UserRole.PASSENGER,
      undefined,
      undefined,
      googleOnly.id as string,
    );
    expect(session.user.email).toBe('marie@gmail.com');
    expect(session.needsPinSetup).toBe(false);
  });

  it('sets a PIN on a Google-only user with no phone', async () => {
    const googleOnly = makeUser({
      id: 'g-pin-setup',
      phone: null,
      email: 'marie@gmail.com',
      googleId: 'gid-new',
      localPinHash: null,
    });
    prisma.user.findUnique.mockResolvedValue(googleOnly);
    prisma.user.update.mockResolvedValue({ ...googleOnly, localPinHash: 'hashed' });
    const result = await service.setupLocalPin('g-pin-setup', '847291', '847291');
    expect(result.pinConfigured).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g-pin-setup' },
        data: expect.objectContaining({ localPinHash: expect.any(String) }),
      }),
    );
  });

  it('Google login of a phone user issues JWT without email or SMS OTP and keeps the same userId', async () => {
    const existing = makeUser({
      id: 'phone-user',
      phone: '+243811111111',
      googleId: 'gid-new',
      email: 'marie@gmail.com',
    });
    prisma.user.findUnique.mockResolvedValue(existing);
    prisma.user.update.mockResolvedValue(existing);
    const done = googleSession(await service.loginWithGoogle('id-token', UserRole.PASSENGER));
    expect(done.user.id).toBe('phone-user');
    expect(done.isNew).toBe(false);
    expect(done.accessToken).toBe('jwt-token');
    expect(done).not.toHaveProperty('otpRequired');
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(mailer.sendOtp).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('attaches Google to an existing phone user when emails match — same userId, no OTP', async () => {
    const existing = makeUser({ id: 'email-match', email: 'marie@gmail.com', googleId: null });
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
    const done = googleSession(await service.loginWithGoogle('id-token', UserRole.PASSENGER));
    expect(done.user.id).toBe('email-match');
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(mailer.sendOtp).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.objectContaining({ googleId: 'gid-new' }),
      }),
    );
  });

  it('completes Google login without sending email OTP even if the mailer is down', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    mailer.sendOtp.mockResolvedValue({ success: false, message: 'SMTP missing' });
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
    expect(mailer.sendOtp).not.toHaveBeenCalled();
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
    prisma.user.update.mockResolvedValue({ ...owner, googleId: 'gid-owner', email: 'celestinkas@gmail.com' });
    const result = googleSession(await service.loginWithGoogle('id-token', UserRole.ADMIN));
    expect(result.accessToken).toBe('jwt-token');
    expect(result.user.role).toBe(UserRole.SUPER_ADMIN);
    expect(result).not.toHaveProperty('otpRequired');
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(mailer.sendOtp).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses Google login when the Google email is not verified', async () => {
    googleTokens.verify.mockResolvedValue({
      googleId: 'gid-new',
      email: 'new.user@gmail.com',
      emailVerified: false,
      givenName: 'Marie',
      familyName: 'Kabila',
      picture: null,
      audience: 'web',
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.loginWithGoogle('id-token', UserRole.PASSENGER)).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_INVALID_GOOGLE },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(mailer.sendOtp).not.toHaveBeenCalled();
  });

  it('allows owner SUPER_ADMIN Google on the restaurant portal (same account, no email OTP)', async () => {
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
    prisma.user.update.mockResolvedValue({ ...owner, googleId: 'gid-owner' });
    const result = googleSession(await service.loginWithGoogle('id-token', UserRole.RESTAURANT, 'restaurant'));
    expect(result.accessToken).toBe('jwt-token');
    expect(result.user.role).toBe(UserRole.SUPER_ADMIN);
    expect(result).not.toHaveProperty('otpRequired');
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(mailer.sendOtp).not.toHaveBeenCalled();
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

  it('issues a login PIN and sends SMS without logging the code', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    prisma.user.findUnique.mockResolvedValue(makeUser({ phone: '+243811111111', email: 'a@b.cd' }));
    prisma.user.update.mockResolvedValue(makeUser());
    const result = await service.issueLoginPin('user-1');
    expect(result.smsSent).toBe(true);
    expect(result.emailSent).toBe(true);
    expect(result.hasPhone).toBe(true);
    expect(result.loginPin).toMatch(/^\d{6}$/);
    expect(sms.sendSms).toHaveBeenCalledWith('+243811111111', expect.stringContaining(result.loginPin!), 'login_pin');
    expect(mailer.sendLoginPin).toHaveBeenCalledWith('a@b.cd', result.loginPin);
    const logged = logSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain(result.loginPin);
    logSpy.mockRestore();
  });

  it('envoie le PIN de connexion par e-mail si le compte n\'a pas de +243', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ phone: null, email: 'only@ex.com' }));
    prisma.user.update.mockResolvedValue(makeUser({ phone: null, email: 'only@ex.com' }));
    const result = await service.issueLoginPin('user-1');
    expect(result.hasPhone).toBe(false);
    expect(result.hasEmail).toBe(true);
    expect(result.emailSent).toBe(true);
    expect(sms.sendSms).not.toHaveBeenCalled();
    expect(mailer.sendLoginPin).toHaveBeenCalledWith('only@ex.com', result.loginPin);
  });

  it('ne marque pas emailSent si SMTP refuse le PIN', async () => {
    mailer.sendLoginPin.mockResolvedValue({ success: false, message: 'Authentification SMTP refusée.' });
    prisma.user.findUnique.mockResolvedValue(makeUser({ phone: null, email: 'only@ex.com' }));
    prisma.user.update.mockResolvedValue(makeUser({ phone: null, email: 'only@ex.com' }));
    const result = await service.issueLoginPin('user-1');
    expect(result.emailSent).toBe(false);
    expect(result.emailError).toMatch(/SMTP/);
    expect(result.loginPin).toMatch(/^\d{6}$/);
  });

  it('enregistre un PIN fourni sans renvoyer SMS ni e-mail', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ phone: '+243811111111', email: 'a@b.cd' }));
    prisma.user.update.mockResolvedValue(makeUser());
    const result = await service.issueLoginPin('user-1', { pin: '111657', notify: false });
    expect(result.loginPin).toBe('111657');
    expect(result.smsSent).toBe(false);
    expect(result.emailSent).toBe(false);
    expect(sms.sendSms).not.toHaveBeenCalled();
    expect(mailer.sendLoginPin).not.toHaveBeenCalled();
  });

  it('envoie un avis KYC par e-mail si seul l\'e-mail est lié', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ phone: null, email: 'only@ex.com' }));
    const result = await service.notifyUser('user-1', {
      smsText: 'SENGA : code 111657',
      emailSubject: "Votre code d'activation SENGA",
      emailText: 'Votre code d\'activation chauffeur SENGA est 111657.',
      purpose: 'driver_activation',
    });
    expect(result.hasPhone).toBe(false);
    expect(result.hasEmail).toBe(true);
    expect(result.emailSent).toBe(true);
    expect(result.smsSent).toBe(false);
    expect(sms.sendSms).not.toHaveBeenCalled();
    expect(mailer.sendNotice).toHaveBeenCalledWith(
      'only@ex.com',
      "Votre code d'activation SENGA",
      expect.stringContaining('111657'),
      undefined,
    );
  });

  it('envoie le motif de refus par SMS quand le +243 est sur User', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ phone: '0810000001', email: null }));
    const motif = 'RCCM illisible, renvoyer une photo nette';
    const result = await service.notifyUser('user-1', {
      smsText: `SENGA : justificatif refusé. Motif : ${motif}.`,
      emailSubject: 'SENGA : justificatif refusé',
      emailText: `Motif : ${motif}`,
      purpose: 'kyc_reject',
    });
    expect(result.hasPhone).toBe(true);
    expect(result.smsSent).toBe(true);
    expect(sms.sendSms).toHaveBeenCalledWith('+243810000001', expect.stringContaining(motif), 'kyc_reject');
    expect(mailer.sendNotice).not.toHaveBeenCalled();
  });
});
