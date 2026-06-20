import { Injectable } from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';

@Injectable()
export class TripShareService {
  private readonly ttlHours = 24;

  generateCompletionPin(): string {
    return String(randomInt(1000, 10000));
  }

  generateToken(): string {
    return randomBytes(16).toString('hex');
  }

  shareExpiresAt(): Date {
    return new Date(Date.now() + this.ttlHours * 60 * 60 * 1000);
  }

  buildShareUrl(token: string, baseUrl?: string): string {
    const root = (baseUrl ?? process.env.PUBLIC_APP_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
    return `${root}/public/trips/${token}`;
  }
}
