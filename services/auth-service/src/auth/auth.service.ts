import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User, UserRole, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import {
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
  UserCreatedPayload,
  normalizePhoneRdc,
  serviceUrl,
  validatePhoneRdc,
  INTERNAL_API_KEY,
  formatMovaPublicId,
  maskPhoneRdc,
  maskEmail,
  isTestOtpAllowedForPhone,
  matchesSeedTestOtp,
  otpCodesToIssue,
  TEST_OTP_CODE,
  SMS_UNAVAILABLE_USER_MESSAGE,
  denyJwtJti,
  isMockOtpAllowed,
  isProductionRuntime,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '@mova/shared';
import { SmsService } from './sms.providers';
import { EMAIL_UNAVAILABLE_USER_MESSAGE, EmailOtpMailer } from './email-otp.mailer';
import { hashLocalPin, isValidLocalPin, verifyLocalPin } from './local-pin.util';
import {
  defaultPartnerDisplayName,
  isAllowedPartnerSelfRegisterRole,
  isPartnerPortalRole,
  isStaffAuthRole,
  missingInviteOnlyAccountMessage,
  mismatchedPartnerRoleMessage,
  OWNER_SUPER_ADMIN_PHONE,
  isOwnerSuperAdminEmail,
  roleFromPartnerPortal,
  sanitizeIntendedAuthRole,
  shouldRefusePassengerAutoRegister,
  STAFF_ON_PARTNER_PORTAL_MESSAGE,
} from './partner-auth.util';
import { hashOtpCode } from './otp-code.util';
import { GoogleIdentity, GoogleTokenVerifier } from './google-id-token';

const PIN_FAIL_PREFIX = 'auth:pin:fail:';
const PIN_FAIL_MAX = 5;
const PIN_FAIL_TTL_SEC = 15 * 60;

const OTP_FAIL_PREFIX = 'auth:otp:fail:';
const OTP_FAIL_MAX = 5;
const OTP_FAIL_TTL_SEC = 15 * 60;

const GOOGLE_CHALLENGE_PREFIX = 'auth:google:ch:';
const GOOGLE_CHALLENGE_TTL_SEC = 10 * 60;

type GoogleOtpChannel = 'sms' | 'email';

type GoogleOtpChallengeResult = {
  success: true;
  otpRequired: true;
  challengeId: string;
  otpChannel: GoogleOtpChannel;
  destinationMasked: string;
  message: string;
  mockCode?: string;
};

type GoogleChallenge = {
  googleId: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  picture: string | null;
  userId: string | null;
  isNew: boolean;
  role?: UserRole;
  destination: string;
  channel: GoogleOtpChannel;
};

const PASSENGER_ON_DRIVER_APP_MESSAGE =
  'Ce numéro est un compte passager. Utilisez l\'application SENGA passager, ou attendez qu\'un administrateur vous promeuve chauffeur (après KYC).';
const NO_DRIVER_ACCOUNT_MESSAGE =
  'Aucun compte chauffeur pour ce numéro. Utilisez l\'application SENGA passager, ou attendez une promotion chauffeur après validation KYC.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private redis: RedisService,
    private sms: SmsService,
    private googleTokens: GoogleTokenVerifier,
    private emailOtp: EmailOtpMailer,
  ) {}

  async requestOtp(phone: string, role?: UserRole, portal?: string, intendedRole?: string) {
    const requestedRole = this.resolveRequestedAuthRole(role, portal, intendedRole);
    if (phone == null || typeof phone !== 'string' || !phone.trim()) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_INVALID_PHONE,
        HttpStatus.BAD_REQUEST,
        'Numéro de téléphone requis.',
      );
    }
    const normalized = normalizePhoneRdc(phone);
    if (!validatePhoneRdc(normalized)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PHONE, HttpStatus.BAD_REQUEST);
    }
    await this.assertInviteOnlyAccountExists(normalized, requestedRole);
    const useTestOtp = isTestOtpAllowedForPhone(normalized);
    const liveCode = useTestOtp ? TEST_OTP_CODE : crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    try {
      await this.prisma.otpCode.updateMany({
        where: { phone: normalized, used: false },
        data: { used: true },
      });
      for (const code of otpCodesToIssue(normalized, liveCode)) {
        await this.prisma.otpCode.create({
          data: { phone: normalized, code: hashOtpCode(code), expiresAt },
        });
      }
    } catch (e) {
      if (e instanceof MovaHttpException) throw e;
      this.logger.error(`OTP persist failed for ${maskPhoneRdc(normalized)}: ${(e as Error).message}`);
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        SMS_UNAVAILABLE_USER_MESSAGE,
      );
    }

    if (useTestOtp) {
      this.logger.warn(`TEST OTP ${TEST_OTP_CODE} for whitelisted phone ${maskPhoneRdc(normalized)}`);
      return {
        success: true,
        message: 'Code OTP envoyé (mode test)',
        phone: normalized,
        ...(process.env.NODE_ENV !== 'production' ? { mockCode: TEST_OTP_CODE } : {}),
      };
    }

    let smsResult: { success: boolean; message?: string };
    try {
      smsResult = await this.sms.sendOtp(normalized, liveCode);
    } catch (e) {
      this.logger.error(`OTP SMS threw for ${maskPhoneRdc(normalized)}: ${(e as Error).message}`);
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        SMS_UNAVAILABLE_USER_MESSAGE,
      );
    }
    if (!smsResult.success) {
      this.logger.error(`OTP SMS failed for ${maskPhoneRdc(normalized)}: ${smsResult.message}`);
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        SMS_UNAVAILABLE_USER_MESSAGE,
      );
    }
    return { success: true, message: smsResult.message ?? 'Code OTP envoyé', phone: normalized };
  }

  async getLoginOptions(phone: string, role?: UserRole, portal?: string, intendedRole?: string) {
    const requestedRole = this.resolveRequestedAuthRole(role, portal, intendedRole);
    const normalized = this.normalizePhoneOrThrow(phone);
    const user = await this.prisma.user.findUnique({ where: { phone: normalized } });
    if (!user || !user.localPinHash) {
      return { success: true, phone: normalized, pinEnabled: false };
    }
    try {
      this.assertRoleAccess(user, requestedRole);
    } catch {
      return { success: true, phone: normalized, pinEnabled: false };
    }
    return { success: true, phone: normalized, pinEnabled: true };
  }

  async loginWithPin(phone: string, pin: string, role?: UserRole, portal?: string, intendedRole?: string) {
    const requestedRole = this.resolveRequestedAuthRole(role, portal, intendedRole);
    const normalized = this.normalizePhoneOrThrow(phone);
    await this.assertPinNotLocked(normalized);
    const user = await this.prisma.user.findUnique({ where: { phone: normalized } });
    if (!user?.localPinHash) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_PIN_NOT_SET,
        HttpStatus.BAD_REQUEST,
        'Aucun code PIN configuré. Connectez-vous par SMS.',
      );
    }
    this.assertRoleAccess(user, requestedRole);
    if (!verifyLocalPin(pin, user.localPinHash)) {
      await this.registerPinFailure(normalized);
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PIN, HttpStatus.UNAUTHORIZED);
    }
    await this.clearPinFailures(normalized);
    if (user.status === UserStatus.SUSPENDED) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, 'Compte suspendu. Contactez le support SENGA.');
    }
    return this.buildAuthResponse(user, { isNew: false });
  }

  async setupLocalPin(userId: string, pin: string, confirmPin: string) {
    if (pin !== confirmPin) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Les codes PIN ne correspondent pas.',
      );
    }
    if (!isValidLocalPin(pin)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Choisissez un code PIN à 6 chiffres plus sécurisé (évitez 123456 ou chiffres identiques).',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new MovaHttpException(MovaErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        localPinHash: hashLocalPin(pin),
        localPinSetAt: new Date(),
      },
    });
    return { success: true, message: 'Code PIN enregistré', pinConfigured: true };
  }

  private async provisionUser(userId: string, role: UserRole) {
    const headers = { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY };
    try {
      const walletRes = await fetch(serviceUrl('payment', '/internal/wallets'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId }),
      });
      if (!walletRes.ok) {
        this.logger.warn(`Wallet provision HTTP ${walletRes.status} for ${userId}`);
      }
    } catch (e) {
      this.logger.warn(`Wallet provision failed for ${userId}: ${(e as Error).message}`);
    }
    if (role === UserRole.DRIVER) {
      try {
        const driverRes = await fetch(serviceUrl('driver', '/internal/profiles'), {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId }),
        });
        if (!driverRes.ok) {
          this.logger.warn(`Driver profile provision HTTP ${driverRes.status} for ${userId}`);
        }
      } catch (e) {
        this.logger.warn(`Driver profile provision failed for ${userId}: ${(e as Error).message}`);
      }
    }
    if (role === UserRole.RESTAURANT) {
      try {
        const restoRes = await fetch(serviceUrl('ride', '/internal/restaurants/ensure'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ownerUserId: userId,
            name: defaultPartnerDisplayName(UserRole.RESTAURANT),
          }),
        });
        if (!restoRes.ok) {
          this.logger.warn(`Restaurant profile provision HTTP ${restoRes.status} for ${userId}`);
        }
      } catch (e) {
        this.logger.warn(`Restaurant profile provision failed for ${userId}: ${(e as Error).message}`);
      }
    }
  }

  async verifyOtp(phone: string, code: string, role?: UserRole, portal?: string, intendedRole?: string) {
    const requestedRole = this.resolveRequestedAuthRole(role, portal, intendedRole);
    const normalized = await this.consumeValidOtp(phone, code);

    let user = await this.prisma.user.findUnique({ where: { phone: normalized } });
    let isNew = false;
    if (!user) {
      if (requestedRole === UserRole.DRIVER) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          NO_DRIVER_ACCOUNT_MESSAGE,
        );
      }
      if (isStaffAuthRole(requestedRole) || normalized === OWNER_SUPER_ADMIN_PHONE) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          missingInviteOnlyAccountMessage(normalized, requestedRole),
        );
      }
      if (shouldRefusePassengerAutoRegister(normalized, requestedRole)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          missingInviteOnlyAccountMessage(normalized, requestedRole),
        );
      }
      const createdRole = isAllowedPartnerSelfRegisterRole(requestedRole)
        ? requestedRole!
        : UserRole.PASSENGER;
      user = await this.prisma.user.create({
        data: {
          phone: normalized,
          role: createdRole,
          status: UserStatus.ACTIVE,
        },
      });
      isNew = true;
      await this.provisionUser(user.id, user.role);
      try {
        const payload: UserCreatedPayload = { userId: user.id, phone: user.phone ?? undefined, role: user.role };
        await this.redis.publish(MOVA_EVENTS.USER_CREATED, payload);
      } catch (e) {
        this.logger.warn(`USER_CREATED publish failed: ${(e as Error).message}`);
      }
    }
    this.assertRoleAccess(user, requestedRole);
    if (user.status === UserStatus.SUSPENDED) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, 'Compte suspendu. Contactez le support SENGA.');
    }
    try {
      await this.clearPinFailures(normalized);
    } catch (e) {
      this.logger.warn(`clearPinFailures failed: ${(e as Error).message}`);
    }
    return this.buildAuthResponse(user, { isNew });
  }

  /**
   * Step 1: verify Google ID token, issue OTP (SMS if the account has a phone, else email).
   * Does not return a session JWT. Never creates DRIVER or staff. Partner roles only
   * from restaurant / rental portals (explicit role or portal).
   */
  async loginWithGoogle(
    idToken: string,
    role?: UserRole,
    portal?: string,
    intendedRole?: string,
  ): Promise<GoogleOtpChallengeResult | ReturnType<AuthService['buildAuthResponse']>> {
    const requestedRole = this.resolveRequestedAuthRole(role, portal, intendedRole);
    const identity = await this.googleTokens.verify(idToken);
    let user = await this.resolveGoogleLoginUser(identity, requestedRole);

    if (!user) {
      this.assertGoogleCanAutoRegister(requestedRole, identity.email);
    } else {
      this.assertRoleAccess(user, requestedRole);
      if (user.status === UserStatus.SUSPENDED) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Compte suspendu. Contactez le support SENGA.',
        );
      }
    }

    const channel: GoogleOtpChannel = user?.phone ? 'sms' : 'email';
    const destination = channel === 'sms' ? user!.phone! : (identity.email ?? user?.email ?? null);
    if (!destination) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_INVALID_GOOGLE,
        HttpStatus.BAD_REQUEST,
        'Votre compte Google n\'a pas d\'e-mail. Liez un numéro +243 ou utilisez un autre compte Google.',
      );
    }
    if (channel === 'email' && identity.email && identity.emailVerified === false) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_INVALID_GOOGLE,
        HttpStatus.BAD_REQUEST,
        'E-mail Google non vérifié. Vérifiez-le chez Google, ou liez un numéro +243.',
      );
    }

    let issued: { mock: boolean };
    try {
      issued = await this.issueOtpToDestination(destination, channel);
    } catch (e) {
      if (this.canCompleteVerifiedGoogleWithoutOtp(identity, user, requestedRole, channel, e)) {
        this.logger.warn(
          `${channel} OTP unavailable — completing verified Google login for ${
            channel === 'sms' ? maskPhoneRdc(destination) : maskEmail(destination)
          }`,
        );
        return this.finalizeGoogleSession(identity, user, requestedRole);
      }
      throw e;
    }
    let challengeId: string;
    try {
      challengeId = await this.storeGoogleChallenge({
        googleId: identity.googleId,
        email: identity.email,
        givenName: identity.givenName,
        familyName: identity.familyName,
        picture: identity.picture,
        userId: user?.id ?? null,
        isNew: !user,
        role: requestedRole,
        destination,
        channel,
      });
    } catch (e) {
      if (this.canCompleteVerifiedGoogleWithoutOtp(identity, user, requestedRole, channel, e)) {
        this.logger.warn('Google challenge store failed — completing verified Google login');
        return this.finalizeGoogleSession(identity, user, requestedRole);
      }
      throw e;
    }
    const destinationMasked = channel === 'sms' ? maskPhoneRdc(destination) : maskEmail(destination);
    const message =
      channel === 'sms'
        ? 'Code envoyé par SMS. Entrez-le pour terminer la connexion.'
        : 'Code envoyé par e-mail. Vérifiez votre boîte de réception.';
    return {
      success: true,
      otpRequired: true,
      challengeId,
      otpChannel: channel,
      destinationMasked,
      message,
      ...(issued.mock && !isProductionRuntime() ? { mockCode: TEST_OTP_CODE } : {}),
    };
  }

  /**
   * Step 2: consume the Google OTP challenge and issue the session JWT.
   * New Google-only passengers are created here (one wallet). Existing users keep the same id.
   */
  async verifyGoogleOtp(
    challengeId: string,
    code: string,
    role?: UserRole,
    portal?: string,
    intendedRole?: string,
  ) {
    const challenge = await this.loadGoogleChallenge(challengeId);
    const requestedRole = this.resolveRequestedAuthRole(role ?? challenge.role, portal, intendedRole);
    await this.consumeValidOtp(challenge.destination, code, { email: challenge.channel === 'email' });

    let user: User | null = challenge.userId
      ? await this.prisma.user.findUnique({ where: { id: challenge.userId } })
      : null;
    let isNew = false;

    const identity: GoogleIdentity = {
      googleId: challenge.googleId,
      email: challenge.email,
      emailVerified: true,
      givenName: challenge.givenName,
      familyName: challenge.familyName,
      picture: challenge.picture,
      audience: '',
    };

    if (!user) {
      this.assertGoogleCanAutoRegister(requestedRole, identity.email);
      const createdRole = isAllowedPartnerSelfRegisterRole(requestedRole)
        ? requestedRole!
        : UserRole.PASSENGER;
      user = await this.prisma.user.create({
        data: {
          googleId: identity.googleId,
          email: identity.email,
          firstName: identity.givenName,
          lastName: identity.familyName,
          avatarUrl: identity.picture,
          role: createdRole,
          status: UserStatus.ACTIVE,
        },
      });
      isNew = true;
      await this.provisionUser(user.id, user.role);
      try {
        const payload: UserCreatedPayload = { userId: user.id, phone: user.phone ?? undefined, role: user.role };
        await this.redis.publish(MOVA_EVENTS.USER_CREATED, payload);
      } catch (e) {
        this.logger.warn(`USER_CREATED publish failed: ${(e as Error).message}`);
      }
    } else {
      user = await this.attachGoogleIdentity(user, identity);
    }

    this.assertRoleAccess(user, requestedRole);
    if (user.status === UserStatus.SUSPENDED) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Compte suspendu. Contactez le support SENGA.',
      );
    }
    await this.clearGoogleChallenge(challengeId);
    if (user.phone) {
      try {
        await this.clearPinFailures(user.phone);
      } catch (e) {
        this.logger.warn(`clearPinFailures failed: ${(e as Error).message}`);
      }
    }
    return this.buildAuthResponse(user, { isNew });
  }

  /**
   * Attach Google to the JWT user. Does not change role (no self-promote).
   * Rejects if this googleId already belongs to someone else.
   */
  async linkGoogle(userId: string, idToken: string, otpCode?: string) {
    const identity = await this.googleTokens.verify(idToken);
    const user = await this.requireActiveUser(userId);
    if (user.phone && otpCode) {
      await this.consumeValidOtp(user.phone, otpCode);
    }
    const linked = await this.attachGoogleIdentity(user, identity);
    return this.buildLinkResponse(linked);
  }

  /**
   * Attach a verified +243 to the JWT user (OTP already requested via /auth/otp/request).
   * Rejects if the phone belongs to another account. Does not change role.
   */
  async linkPhone(userId: string, phone: string, otpCode: string) {
    const normalized = await this.consumeValidOtp(phone, otpCode);
    const user = await this.requireActiveUser(userId);
    if (user.phone && user.phone !== normalized) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.CONFLICT,
        'Ce compte a déjà un numéro. Déliez-le d\'abord pour en changer.',
      );
    }
    const taken = await this.prisma.user.findUnique({ where: { phone: normalized } });
    if (taken && taken.id !== user.id) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_IDENTITY_TAKEN,
        HttpStatus.CONFLICT,
        'Ce numéro est déjà utilisé par un autre compte SENGA.',
      );
    }
    const updated =
      user.phone === normalized
        ? user
        : await this.prisma.user.update({
            where: { id: user.id },
            data: { phone: normalized },
          });
    return this.buildLinkResponse(updated);
  }

  async unlinkGoogle(userId: string) {
    const user = await this.requireActiveUser(userId);
    if (!user.googleId) {
      return this.buildLinkResponse(user, 'Google n\'est pas lié à ce compte.');
    }
    if (!user.phone) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.CONFLICT,
        'Impossible de délier Google : ajoutez d\'abord un numéro +243.',
      );
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { googleId: null },
    });
    return this.buildLinkResponse(updated, 'Compte Google délié.');
  }

  async unlinkPhone(userId: string) {
    const user = await this.requireActiveUser(userId);
    if (!user.phone) {
      return this.buildLinkResponse(user, 'Aucun numéro lié à ce compte.');
    }
    if (user.phone === OWNER_SUPER_ADMIN_PHONE) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Le numéro du compte propriétaire SENGA ne peut pas être détaché.',
      );
    }
    if (!user.googleId) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.CONFLICT,
        'Impossible de délier le numéro : liez d\'abord Google.',
      );
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { phone: null, localPinHash: null, localPinSetAt: null },
    });
    return this.buildLinkResponse(updated, 'Numéro délié. Connectez-vous avec Google.');
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  private resolveRequestedAuthRole(
    role?: UserRole,
    portal?: string,
    intendedRole?: string,
  ): UserRole | undefined {
    if (isStaffAuthRole(role)) return role;
    const fromIntended = sanitizeIntendedAuthRole(intendedRole);
    const fromPortal = roleFromPartnerPortal(portal);
    if (portal && !fromPortal) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Portail inconnu. Utilisez restaurant ou rental.',
      );
    }
    if (fromPortal && role && role !== fromPortal) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Le rôle ne correspond pas à ce portail partenaire.',
      );
    }
    if (fromIntended && fromPortal && fromIntended !== fromPortal) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Le rôle demandé ne correspond pas à ce portail partenaire.',
      );
    }
    return (fromIntended as UserRole | undefined) ?? role ?? (fromPortal as UserRole | undefined);
  }

  private async resolveGoogleLoginUser(
    identity: GoogleIdentity,
    requestedRole?: UserRole,
  ): Promise<User | null> {
    let user = await this.prisma.user.findUnique({ where: { googleId: identity.googleId } });
    if (isStaffAuthRole(requestedRole)) {
      const owner = await this.resolveAllowlistedSuperAdmin(identity);
      if (owner) return owner;
      if (user && isStaffAuthRole(user.role)) return user;
      if (!user && identity.email) {
        user = await this.prisma.user.findFirst({
          where: { email: { equals: identity.email, mode: 'insensitive' } },
        });
        if (user && isStaffAuthRole(user.role)) return user;
      }
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Aucun compte autorisé pour cet e-mail Google. Le compte staff doit déjà exister.',
      );
    }
    if (!user && identity.email) {
      user = await this.prisma.user.findFirst({
        where: { email: { equals: identity.email, mode: 'insensitive' } },
      });
    }
    return user;
  }

  private async resolveAllowlistedSuperAdmin(identity: GoogleIdentity): Promise<User | null> {
    if (!isOwnerSuperAdminEmail(identity.email)) return null;
    const owner = await this.prisma.user.findUnique({ where: { phone: OWNER_SUPER_ADMIN_PHONE } });
    if (owner && owner.role === UserRole.SUPER_ADMIN) return owner;
    return null;
  }

  private canCompleteVerifiedGoogleWithoutOtp(
    identity: GoogleIdentity,
    user: User | null,
    requestedRole: UserRole | undefined,
    channel: GoogleOtpChannel,
    error: unknown,
  ): boolean {
    if (!(error instanceof MovaHttpException) || error.getStatus() !== HttpStatus.SERVICE_UNAVAILABLE) {
      return false;
    }
    if (identity.emailVerified === false) return false;
    if (channel === 'email') return true;
    return (
      isOwnerSuperAdminEmail(identity.email) ||
      Boolean(user && isStaffAuthRole(user.role) && isStaffAuthRole(requestedRole))
    );
  }

  private async finalizeGoogleSession(
    identity: GoogleIdentity,
    existing: User | null,
    requestedRole?: UserRole,
  ) {
    let user = existing;
    let isNew = false;
    if (!user) {
      this.assertGoogleCanAutoRegister(requestedRole, identity.email);
      const createdRole = isAllowedPartnerSelfRegisterRole(requestedRole)
        ? requestedRole!
        : UserRole.PASSENGER;
      user = await this.prisma.user.create({
        data: {
          googleId: identity.googleId,
          email: identity.email,
          firstName: identity.givenName,
          lastName: identity.familyName,
          avatarUrl: identity.picture,
          role: createdRole,
          status: UserStatus.ACTIVE,
        },
      });
      isNew = true;
      await this.provisionUser(user.id, user.role);
      try {
        const payload: UserCreatedPayload = { userId: user.id, phone: user.phone ?? undefined, role: user.role };
        await this.redis.publish(MOVA_EVENTS.USER_CREATED, payload);
      } catch (e) {
        this.logger.warn(`USER_CREATED publish failed: ${(e as Error).message}`);
      }
    } else {
      user = await this.attachGoogleIdentity(user, identity);
    }
    this.assertRoleAccess(user, requestedRole);
    if (user.status === UserStatus.SUSPENDED) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Compte suspendu. Contactez le support SENGA.',
      );
    }
    if (user.phone) {
      try {
        await this.clearPinFailures(user.phone);
      } catch (e) {
        this.logger.warn(`clearPinFailures failed: ${(e as Error).message}`);
      }
    }
    return this.buildAuthResponse(user, { isNew });
  }

  private assertGoogleCanAutoRegister(role?: UserRole, email?: string | null) {
    if (isPartnerPortalRole(role) && isOwnerSuperAdminEmail(email)) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        STAFF_ON_PARTNER_PORTAL_MESSAGE,
      );
    }
    if (role === UserRole.DRIVER) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Aucun compte chauffeur lié à Google. Connectez-vous avec votre numéro +243, ou terminez le KYC chauffeur.',
      );
    }
    if (isStaffAuthRole(role)) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Aucun compte autorisé pour cet e-mail Google. Le compte staff doit déjà exister.',
      );
    }
    if (isAllowedPartnerSelfRegisterRole(role)) {
      return;
    }
    if (isPartnerPortalRole(role) || shouldRefusePassengerAutoRegister('', role)) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        missingInviteOnlyAccountMessage('', role),
      );
    }
  }

  private async issueOtpToDestination(destination: string, channel: GoogleOtpChannel) {
    const useTestOtp = channel === 'sms' ? isTestOtpAllowedForPhone(destination) : isMockOtpAllowed();
    const liveCode = useTestOtp ? TEST_OTP_CODE : crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    try {
      await this.prisma.otpCode.updateMany({
        where: { phone: destination, used: false },
        data: { used: true },
      });
      for (const code of otpCodesToIssue(destination, liveCode)) {
        await this.prisma.otpCode.create({
          data: { phone: destination, code: hashOtpCode(code), expiresAt },
        });
      }
    } catch (e) {
      this.logger.error(`Google OTP persist failed: ${(e as Error).message}`);
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        channel === 'sms' ? SMS_UNAVAILABLE_USER_MESSAGE : EMAIL_UNAVAILABLE_USER_MESSAGE,
      );
    }

    if (useTestOtp) {
      const label = channel === 'sms' ? maskPhoneRdc(destination) : maskEmail(destination);
      this.logger.warn(`TEST OTP ${TEST_OTP_CODE} for Google ${channel} ${label}`);
      return { mock: true as const };
    }

    if (channel === 'sms') {
      let smsResult: { success: boolean; message?: string };
      try {
        smsResult = await this.sms.sendOtp(destination, liveCode);
      } catch (e) {
        this.logger.error(`OTP SMS threw for ${maskPhoneRdc(destination)}: ${(e as Error).message}`);
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          HttpStatus.SERVICE_UNAVAILABLE,
          SMS_UNAVAILABLE_USER_MESSAGE,
        );
      }
      if (!smsResult.success) {
        this.logger.error(`OTP SMS failed for ${maskPhoneRdc(destination)}: ${smsResult.message}`);
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          HttpStatus.SERVICE_UNAVAILABLE,
          SMS_UNAVAILABLE_USER_MESSAGE,
        );
      }
      return { mock: false as const };
    }

    let emailResult: { success: boolean; message: string };
    try {
      emailResult = await this.emailOtp.sendOtp(destination, liveCode);
    } catch (e) {
      this.logger.error(`OTP email threw for ${maskEmail(destination)}: ${(e as Error).message}`);
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        EMAIL_UNAVAILABLE_USER_MESSAGE,
      );
    }
    if (!emailResult.success) {
      this.logger.error(`OTP email failed for ${maskEmail(destination)}: ${emailResult.message}`);
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        EMAIL_UNAVAILABLE_USER_MESSAGE,
      );
    }
    return { mock: false as const };
  }

  private async storeGoogleChallenge(challenge: GoogleChallenge): Promise<string> {
    const challengeId = crypto.randomUUID();
    try {
      await this.redis.client.set(
        `${GOOGLE_CHALLENGE_PREFIX}${challengeId}`,
        JSON.stringify(challenge),
        'EX',
        GOOGLE_CHALLENGE_TTL_SEC,
      );
    } catch (e) {
      this.logger.error(`Google challenge store failed: ${(e as Error).message}`);
      throw new MovaHttpException(
        MovaErrorCode.INTERNAL_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Connexion Google temporairement indisponible. Réessayez.',
      );
    }
    return challengeId;
  }

  private async loadGoogleChallenge(challengeId: string): Promise<GoogleChallenge> {
    const trimmed = String(challengeId ?? '').trim();
    if (!trimmed) {
      throw new MovaHttpException(MovaErrorCode.AUTH_EXPIRED_OTP, HttpStatus.BAD_REQUEST, 'Session Google expirée. Recommencez.');
    }
    let raw: string | null = null;
    try {
      raw = await this.redis.client.get(`${GOOGLE_CHALLENGE_PREFIX}${trimmed}`);
    } catch (e) {
      this.logger.error(`Google challenge load failed: ${(e as Error).message}`);
      throw new MovaHttpException(
        MovaErrorCode.INTERNAL_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Connexion Google temporairement indisponible. Réessayez.',
      );
    }
    if (!raw) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_EXPIRED_OTP,
        HttpStatus.BAD_REQUEST,
        'Session Google expirée. Recommencez avec Google.',
      );
    }
    try {
      return JSON.parse(raw) as GoogleChallenge;
    } catch {
      throw new MovaHttpException(MovaErrorCode.AUTH_EXPIRED_OTP, HttpStatus.BAD_REQUEST, 'Session Google invalide. Recommencez.');
    }
  }

  private async clearGoogleChallenge(challengeId: string) {
    try {
      await this.redis.client.del(`${GOOGLE_CHALLENGE_PREFIX}${challengeId}`);
    } catch (e) {
      this.logger.warn(`Google challenge clear failed: ${(e as Error).message}`);
    }
  }

  private async consumeValidOtp(
    destination: string,
    code: string,
    options?: { email?: boolean },
  ): Promise<string> {
    const normalized = options?.email
      ? String(destination ?? '').trim().toLowerCase()
      : normalizePhoneRdc(destination);
    if (!options?.email && !validatePhoneRdc(normalized)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PHONE, HttpStatus.BAD_REQUEST);
    }
    if (options?.email && !normalized.includes('@')) {
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_OTP);
    }
    const trimmedCode = String(code ?? '').replace(/\s/g, '');
    await this.assertOtpNotLocked(normalized);
    const hashedCode = hashOtpCode(trimmedCode);
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone: normalized, code: hashedCode, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp && !matchesSeedTestOtp(normalized, trimmedCode)) {
      await this.registerOtpFailure(normalized);
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_OTP);
    }
    if (otp) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
    }
    await this.clearOtpFailures(normalized);
    return normalized;
  }

  private async attachGoogleIdentity(user: User, identity: GoogleIdentity): Promise<User> {
    if (user.googleId && user.googleId !== identity.googleId) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.CONFLICT,
        'Ce compte est déjà lié à un autre compte Google.',
      );
    }
    const taken = await this.prisma.user.findUnique({ where: { googleId: identity.googleId } });
    if (taken && taken.id !== user.id) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_IDENTITY_TAKEN,
        HttpStatus.CONFLICT,
        'Cet e-mail Google est déjà lié à un autre compte SENGA.',
      );
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: identity.googleId,
        email: user.email ?? identity.email,
        firstName: user.firstName ?? identity.givenName,
        lastName: user.lastName ?? identity.familyName,
        avatarUrl: user.avatarUrl ?? identity.picture,
      },
    });
  }

  private async requireActiveUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new MovaHttpException(MovaErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (user.status === UserStatus.SUSPENDED) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Compte suspendu. Contactez le support SENGA.',
      );
    }
    return user;
  }

  private normalizePhoneOrThrow(phone: string) {
    const normalized = normalizePhoneRdc(phone);
    if (!validatePhoneRdc(normalized)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PHONE, HttpStatus.BAD_REQUEST);
    }
    return normalized;
  }

  private async assertInviteOnlyAccountExists(phone: string, role?: UserRole) {
    if (role === UserRole.DRIVER) {
      const user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          NO_DRIVER_ACCOUNT_MESSAGE,
        );
      }
      this.assertRoleAccess(user, role);
      return;
    }
    if (!isStaffAuthRole(role)) return;
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        missingInviteOnlyAccountMessage(phone, role),
      );
    }
    this.assertRoleAccess(user, role);
  }

  private assertRoleAccess(user: User, role?: UserRole) {
    const staffRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SUPPORT,
      UserRole.FINANCE,
      UserRole.CONTENT,
    ];
    if (role && isStaffAuthRole(role)) {
      if (!staffRoles.includes(user.role)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Ce compte n\'a pas un rôle staff autorisé. Connexion réservée à la console admin.',
        );
      }
      return;
    }
    if (role === UserRole.PASSENGER && user.role === UserRole.DRIVER) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Ce numéro est un compte chauffeur. Utilisez l\'application SENGA Driver.',
      );
    }
    if (role === UserRole.DRIVER && user.role === UserRole.PASSENGER) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        PASSENGER_ON_DRIVER_APP_MESSAGE,
      );
    }
    if (role === UserRole.DRIVER && staffRoles.includes(user.role)) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Compte staff — connexion réservée à la console admin.',
      );
    }
    if (role === UserRole.PASSENGER && staffRoles.includes(user.role)) {
      // Owner SUPER_ADMIN may still use the passenger app (same phone, PIN/OTP unchanged).
      if (user.role === UserRole.SUPER_ADMIN) {
        return;
      }
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Compte staff — connexion réservée à la console admin.',
      );
    }
    if ((role === UserRole.PASSENGER || role === UserRole.DRIVER) && user.role === UserRole.RENTAL_PARTNER) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Compte partenaire location — utilisez le portail SENGA Location.',
      );
    }
    if ((role === UserRole.PASSENGER || role === UserRole.DRIVER) && user.role === UserRole.RESTAURANT) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Compte restaurant — utilisez le portail SENGA Restaurant.',
      );
    }
    if (role === UserRole.RESTAURANT && user.role !== UserRole.RESTAURANT) {
      if (user.role === UserRole.SUPER_ADMIN) return;
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        mismatchedPartnerRoleMessage(role, user.role),
      );
    }
    if (role === UserRole.RENTAL_PARTNER && user.role !== UserRole.RENTAL_PARTNER) {
      if (user.role === UserRole.SUPER_ADMIN) return;
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        mismatchedPartnerRoleMessage(role, user.role),
      );
    }
  }

  async logout(jti?: string) {
    if (!jti?.trim()) {
      return { success: true, revoked: false };
    }
    try {
      await denyJwtJti(this.redis, jti);
    } catch (e) {
      this.logger.warn(`logout denylist failed: ${(e as Error).message}`);
      throw new MovaHttpException(
        MovaErrorCode.INTERNAL_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Déconnexion temporairement indisponible. Réessayez.',
      );
    }
    return { success: true, revoked: true };
  }

  private buildAuthResponse(user: User, options: { isNew: boolean }) {
    const token = this.jwt.sign(
      {
        sub: user.id,
        phone: user.phone ?? undefined,
        role: user.role,
        status: user.status,
      },
      { jwtid: crypto.randomUUID() },
    );
    return {
      success: true,
      accessToken: token,
      isNew: options.isNew,
      pinConfigured: Boolean(user.localPinHash),
      needsPhone: !user.phone,
      user: {
        id: user.id,
        phone: user.phone ?? '',
        phoneMasked: maskPhoneRdc(user.phone),
        email: user.email ?? '',
        emailMasked: maskEmail(user.email),
        googleLinked: Boolean(user.googleId),
        hasPhone: Boolean(user.phone),
        canUnlinkGoogle: Boolean(user.googleId && user.phone),
        canUnlinkPhone: Boolean(user.phone && user.googleId && user.phone !== OWNER_SUPER_ADMIN_PHONE),
        publicId: formatMovaPublicId(user.id, user.role),
        role: user.role,
        status: user.status,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  private buildLinkResponse(user: User, message?: string) {
    return {
      ...this.buildAuthResponse(user, { isNew: false }),
      message:
        message ??
        'Compte lié. Vous pouvez vous connecter avec le téléphone ou Google.',
    };
  }

  private async assertPinNotLocked(phone: string) {
    try {
      const key = `${PIN_FAIL_PREFIX}${phone}`;
      const raw = await this.redis.client.get(key);
      const fails = raw ? Number.parseInt(raw, 10) : 0;
      if (fails >= PIN_FAIL_MAX) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_PIN_LOCKED,
          HttpStatus.TOO_MANY_REQUESTS,
          'Trop de tentatives PIN. Réessayez dans 15 minutes ou connectez-vous par SMS.',
        );
      }
    } catch (e) {
      if (e instanceof MovaHttpException) throw e;
      // Redis down (free-tier sleep / closed client): fail-open so PIN login still works.
      this.logger.warn(`assertPinNotLocked failed: ${(e as Error).message}`);
    }
  }

  private async registerPinFailure(phone: string) {
    try {
      const key = `${PIN_FAIL_PREFIX}${phone}`;
      const raw = await this.redis.client.get(key);
      const fails = (raw ? Number.parseInt(raw, 10) : 0) + 1;
      await this.redis.client.set(key, String(fails), 'EX', PIN_FAIL_TTL_SEC);
      if (fails >= PIN_FAIL_MAX) {
        this.logger.warn(`PIN locked for ${maskPhoneRdc(phone)} after ${fails} failures`);
      }
    } catch (e) {
      this.logger.warn(`registerPinFailure failed: ${(e as Error).message}`);
    }
  }

  private async clearPinFailures(phone: string) {
    try {
      await this.redis.client.del(`${PIN_FAIL_PREFIX}${phone}`);
    } catch (e) {
      // Redis down / IP allowlist / free-tier sleep: do not block successful login.
      this.logger.warn(`clearPinFailures failed: ${(e as Error).message}`);
    }
  }

  private async assertOtpNotLocked(phone: string) {
    try {
      const key = `${OTP_FAIL_PREFIX}${phone}`;
      const raw = await this.redis.client.get(key);
      const fails = raw ? Number.parseInt(raw, 10) : 0;
      if (fails >= OTP_FAIL_MAX) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.TOO_MANY_REQUESTS,
          'Trop de tentatives OTP. Réessayez dans 15 minutes.',
        );
      }
    } catch (e) {
      if (e instanceof MovaHttpException) throw e;
      // Redis down (free-tier sleep / closed client): fail-open so SMS login still works.
      this.logger.warn(`assertOtpNotLocked failed: ${(e as Error).message}`);
    }
  }

  private async registerOtpFailure(phone: string) {
    try {
      const key = `${OTP_FAIL_PREFIX}${phone}`;
      const raw = await this.redis.client.get(key);
      const fails = (raw ? Number.parseInt(raw, 10) : 0) + 1;
      await this.redis.client.set(key, String(fails), 'EX', OTP_FAIL_TTL_SEC);
      if (fails >= OTP_FAIL_MAX) {
        this.logger.warn(`OTP locked for ${maskPhoneRdc(phone)} after ${fails} failures`);
      }
    } catch (e) {
      this.logger.warn(`registerOtpFailure failed: ${(e as Error).message}`);
    }
  }

  private async clearOtpFailures(phone: string) {
    try {
      await this.redis.client.del(`${OTP_FAIL_PREFIX}${phone}`);
    } catch (e) {
      this.logger.warn(`clearOtpFailures failed: ${(e as Error).message}`);
    }
  }
}
