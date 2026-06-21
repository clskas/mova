import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
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
    const isMock = this.config.get('MOCK_OTP') === 'true';
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

    return { success: true, message: 'Code OTP envoyé', phone: normalized, mockCode: code };
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
    if (user.status === UserStatus.SUSPENDED) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, 'Compte suspendu. Contactez le support MOVA.');
    }
    const token = this.jwt.sign({
      sub: user.id,
      phone: user.phone,
      role: user.role,
      status: user.status,
    });
    return {
      success: true,
      accessToken: token,
      isNew,
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

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
}
