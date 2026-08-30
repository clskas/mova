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
  isTestOtpAllowedForPhone,
  matchesSeedTestOtp,
  otpCodesToIssue,
  TEST_OTP_CODE,
  SMS_UNAVAILABLE_USER_MESSAGE,
  denyJwtJti,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '@mova/shared';
import { SmsService } from './sms.providers';
import { hashLocalPin, isValidLocalPin, verifyLocalPin } from './local-pin.util';
import {
  defaultPartnerDisplayName,
  isPartnerPortalRole,
  isStaffAuthRole,
  missingInviteOnlyAccountMessage,
  mismatchedPartnerRoleMessage,
  shouldRefusePassengerAutoRegister,
} from './partner-auth.util';
import { hashOtpCode } from './otp-code.util';
import { GoogleIdentity, GoogleTokenVerifier } from './google-id-token';

const PIN_FAIL_PREFIX = 'auth:pin:fail:';
const PIN_FAIL_MAX = 5;
const PIN_FAIL_TTL_SEC = 15 * 60;

const OTP_FAIL_PREFIX = 'auth:otp:fail:';
const OTP_FAIL_MAX = 5;
const OTP_FAIL_TTL_SEC = 15 * 60;

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
  ) {}

  async requestOtp(phone: string, role?: UserRole) {
    const normalized = normalizePhoneRdc(phone);
    if (!validatePhoneRdc(normalized)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PHONE, HttpStatus.BAD_REQUEST);
    }
    await this.assertInviteOnlyAccountExists(normalized, role);
    const useTestOtp = isTestOtpAllowedForPhone(normalized);
    const liveCode = useTestOtp ? TEST_OTP_CODE : crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.otpCode.updateMany({
      where: { phone: normalized, used: false },
      data: { used: true },
    });
    for (const code of otpCodesToIssue(normalized, liveCode)) {
      await this.prisma.otpCode.create({
        data: { phone: normalized, code: hashOtpCode(code), expiresAt },
      });
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

    const smsResult = await this.sms.sendOtp(normalized, liveCode);
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

  async getLoginOptions(phone: string, role?: UserRole) {
    const normalized = this.normalizePhoneOrThrow(phone);
    const user = await this.prisma.user.findUnique({ where: { phone: normalized } });
    if (!user || !user.localPinHash) {
      return { success: true, phone: normalized, pinEnabled: false };
    }
    try {
      this.assertRoleAccess(user, role);
    } catch {
      return { success: true, phone: normalized, pinEnabled: false };
    }
    return { success: true, phone: normalized, pinEnabled: true };
  }

  async loginWithPin(phone: string, pin: string, role?: UserRole) {
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
    this.assertRoleAccess(user, role);
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

  async verifyOtp(phone: string, code: string, role?: UserRole) {
    const normalized = await this.consumeValidOtp(phone, code);

    let user = await this.prisma.user.findUnique({ where: { phone: normalized } });
    let isNew = false;
    if (!user) {
      if (role === UserRole.DRIVER) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          NO_DRIVER_ACCOUNT_MESSAGE,
        );
      }
      if (shouldRefusePassengerAutoRegister(normalized, role)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          missingInviteOnlyAccountMessage(normalized, role),
        );
      }
      user = await this.prisma.user.create({
        data: {
          phone: normalized,
          role: UserRole.PASSENGER,
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
    this.assertRoleAccess(user, role);
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
   * Google ID token → existing user (googleId / email / OTP-proved phone) or new PASSENGER.
   * Never creates DRIVER, staff, or partner accounts.
   */
  async loginWithGoogle(idToken: string, role?: UserRole, phone?: string, otpCode?: string) {
    const identity = await this.googleTokens.verify(idToken);
    let user = await this.prisma.user.findUnique({ where: { googleId: identity.googleId } });
    let isNew = false;

    if (!user && identity.email) {
      const byEmail = await this.prisma.user.findFirst({
        where: { email: { equals: identity.email, mode: 'insensitive' } },
      });
      if (byEmail) {
        user = await this.attachGoogleIdentity(byEmail, identity);
      }
    }

    if (!user && phone && otpCode) {
      const normalized = await this.consumeValidOtp(phone, otpCode);
      const byPhone = await this.prisma.user.findUnique({ where: { phone: normalized } });
      if (byPhone) {
        user = await this.attachGoogleIdentity(byPhone, identity);
      }
    }

    if (!user) {
      if (role === UserRole.DRIVER) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Aucun compte chauffeur lié à Google. Connectez-vous avec votre numéro +243, ou terminez le KYC chauffeur.',
        );
      }
      if (isStaffAuthRole(role) || isPartnerPortalRole(role)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Aucun compte autorisé pour cet e-mail Google. Le compte staff / partenaire doit déjà exister.',
        );
      }
      if (shouldRefusePassengerAutoRegister('', role)) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          missingInviteOnlyAccountMessage('', role),
        );
      }
      user = await this.prisma.user.create({
        data: {
          googleId: identity.googleId,
          email: identity.email,
          firstName: identity.givenName,
          lastName: identity.familyName,
          avatarUrl: identity.picture,
          role: UserRole.PASSENGER,
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

    this.assertRoleAccess(user, role);
    if (user.status === UserStatus.SUSPENDED) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, 'Compte suspendu. Contactez le support SENGA.');
    }
    return this.buildAuthResponse(user, { isNew });
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  private async consumeValidOtp(phone: string, code: string): Promise<string> {
    const normalized = normalizePhoneRdc(phone);
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
    if (!isStaffAuthRole(role) && !isPartnerPortalRole(role)) return;
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
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        mismatchedPartnerRoleMessage(role, user.role),
      );
    }
    if (role === UserRole.RENTAL_PARTNER && user.role !== UserRole.RENTAL_PARTNER) {
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
        publicId: formatMovaPublicId(user.id, user.role),
        role: user.role,
        status: user.status,
        firstName: user.firstName,
        lastName: user.lastName,
      },
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
