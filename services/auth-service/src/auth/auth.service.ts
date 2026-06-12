import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
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
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '@mova/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private redis: RedisService,
  ) {}

  async requestOtp(phone: string) {
    const normalized = normalizePhoneRdc(phone);
    if (!validatePhoneRdc(normalized)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PHONE, HttpStatus.BAD_REQUEST);
    }
    const code = this.config.get('MOCK_OTP') === 'true' ? '123456' : crypto.randomInt(100000, 999999).toString();
    await this.prisma.otpCode.create({ data: { phone: normalized, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
    return { success: true, message: 'Code OTP envoyé', phone: normalized, ...(this.config.get('MOCK_OTP') === 'true' ? { mockCode: code } : {}) };
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
      user = await this.prisma.user.create({ data: { phone: normalized, role: role ?? UserRole.PASSENGER } });
      isNew = true;
      await this.provisionUser(user.id, user.role);
      const payload: UserCreatedPayload = { userId: user.id, phone: user.phone, role: user.role };
      await this.redis.publish(MOVA_EVENTS.USER_CREATED, payload);
    }
    if (role === UserRole.DRIVER && user.role !== UserRole.DRIVER) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: UserRole.DRIVER } });
      await fetch(serviceUrl('driver', '/internal/profiles'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ userId: user.id }),
      });
    }
    const token = this.jwt.sign({ sub: user.id, phone: user.phone, role: user.role });
    return { success: true, accessToken: token, isNew, user: { id: user.id, phone: user.phone, role: user.role, firstName: user.firstName, lastName: user.lastName } };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
}
