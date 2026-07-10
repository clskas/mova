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
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '@mova/shared';
import { SmsService } from './sms.providers';
import { hashLocalPin, isValidLocalPin, verifyLocalPin } from './local-pin.util';

const PIN_FAIL_PREFIX = 'auth:pin:fail:';
const PIN_FAIL_MAX = 5;
const PIN_FAIL_TTL_SEC = 15 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private redis: RedisService,
    private sms: SmsService,
  ) {}

  async requestOtp(phone: string) {
    const normalized = normalizePhoneRdc(phone);
    if (!validatePhoneRdc(normalized)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PHONE, HttpStatus.BAD_REQUEST);
    }
    const isMock = this.config.get('NODE_ENV') !== 'production' && this.config.get('MOCK_OTP') === 'true';
    const code = isMock ? '123456' : crypto.randomInt(100000, 999999).toString();
    await this.prisma.otpCode.create({ data: { phone: normalized, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });

    if (!isMock) {
      const smsResult = await this.sms.sendOtp(normalized, code);
      if (!smsResult.success) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          HttpStatus.SERVICE_UNAVAILABLE,
          smsResult.message ?? 'Impossible d\'envoyer le code OTP par SMS.',
        );
      }
      return { success: true, message: smsResult.message ?? 'Code OTP envoyé', phone: normalized };
    }

    return {
      success: true,
      message: 'Code OTP envoyé',
      phone: normalized,
      ...(isMock ? { mockCode: code } : {}),
    };
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
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, 'Compte suspendu. Contactez le support MOVA.');
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
    await fetch(serviceUrl('payment', '/internal/wallets'), { method: 'POST', headers, body: JSON.stringify({ userId }) });
    if (role === UserRole.DRIVER) {
      await fetch(serviceUrl('driver', '/internal/profiles'), { method: 'POST', headers, body: JSON.stringify({ userId }) });
    }
  }

  async verifyOtp(phone: string, code: string, role?: UserRole) {
    const normalized = normalizePhoneRdc(phone);
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone: normalized, code, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_OTP);
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });

    let user = await this.prisma.user.findUnique({ where: { phone: normalized } });
    let isNew = false;
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: normalized,
          role: role ?? UserRole.PASSENGER,
          status: role === UserRole.DRIVER ? UserStatus.PENDING_KYC : UserStatus.ACTIVE,
        },
      });
      isNew = true;
      await this.provisionUser(user.id, user.role);
      const payload: UserCreatedPayload = { userId: user.id, phone: user.phone, role: user.role };
      await this.redis.publish(MOVA_EVENTS.USER_CREATED, payload);
    }
    if (role === UserRole.DRIVER && user.role !== UserRole.DRIVER) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { role: UserRole.DRIVER, status: UserStatus.PENDING_KYC },
      });
      await fetch(serviceUrl('driver', '/internal/profiles'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ userId: user.id }),
      });
    }
    this.assertRoleAccess(user, role);
    if (user.status === UserStatus.SUSPENDED) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, 'Compte suspendu. Contactez le support MOVA.');
    }
    await this.clearPinFailures(normalized);
    return this.buildAuthResponse(user, { isNew });
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  private normalizePhoneOrThrow(phone: string) {
    const normalized = normalizePhoneRdc(phone);
    if (!validatePhoneRdc(normalized)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PHONE, HttpStatus.BAD_REQUEST);
    }
    return normalized;
  }

  private assertRoleAccess(user: User, role?: UserRole) {
    const staffRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SUPPORT,
      UserRole.FINANCE,
      UserRole.CONTENT,
    ];
    if (role === UserRole.PASSENGER && user.role === UserRole.DRIVER) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Ce numéro est un compte chauffeur. Utilisez l\'application MOVA Chauffeur.',
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
        'Compte partenaire location — utilisez le portail MOVA Location.',
      );
    }
    if ((role === UserRole.PASSENGER || role === UserRole.DRIVER) && user.role === UserRole.RESTAURANT) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Compte restaurant — utilisez le portail MOVA Restaurant.',
      );
    }
  }

  private buildAuthResponse(user: User, options: { isNew: boolean }) {
    const token = this.jwt.sign({
      sub: user.id,
      phone: user.phone,
      role: user.role,
      status: user.status,
    });
    return {
      success: true,
      accessToken: token,
      isNew: options.isNew,
      pinConfigured: Boolean(user.localPinHash),
      user: {
        id: user.id,
        phone: user.phone,
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
  }

  private async registerPinFailure(phone: string) {
    const key = `${PIN_FAIL_PREFIX}${phone}`;
    const raw = await this.redis.client.get(key);
    const fails = (raw ? Number.parseInt(raw, 10) : 0) + 1;
    await this.redis.client.set(key, String(fails), 'EX', PIN_FAIL_TTL_SEC);
    if (fails >= PIN_FAIL_MAX) {
      this.logger.warn(`PIN locked for ${maskPhoneRdc(phone)} after ${fails} failures`);
    }
  }

  private async clearPinFailures(phone: string) {
    await this.redis.client.del(`${PIN_FAIL_PREFIX}${phone}`);
  }
}
