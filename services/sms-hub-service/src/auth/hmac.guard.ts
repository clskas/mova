import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { AppsRegistry } from './apps.registry';

const MAX_SKEW_SEC = 300;

@Injectable()
export class HmacGuard implements CanActivate {
  constructor(private readonly apps: AppsRegistry) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: string; hubAppId?: string }>();
    const appId = String(req.header('x-afrisoft-app-id') || '').trim().toLowerCase();
    const apiKeyHeader = String(req.header('x-afrisoft-api-key') || '').trim();
    const timestamp = String(req.header('x-afrisoft-timestamp') || '').trim();
    const signature = String(req.header('x-afrisoft-signature') || '').trim().toLowerCase();

    if (!appId || !apiKeyHeader || !timestamp || !signature) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Missing AfriSoft hub auth headers',
        code: 'HUB_AUTH_MISSING',
      });
    }

    const expectedKey = this.apps.getApiKey(appId);
    if (!expectedKey) {
      throw new ForbiddenException({
        statusCode: 403,
        message: `Unknown app_id: ${appId}`,
        code: 'HUB_APP_UNKNOWN',
      });
    }

    if (apiKeyHeader !== expectedKey) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid API key',
        code: 'HUB_AUTH_INVALID_KEY',
      });
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid timestamp',
        code: 'HUB_AUTH_BAD_TIMESTAMP',
      });
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > MAX_SKEW_SEC) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Timestamp outside allowed skew (300s)',
        code: 'HUB_AUTH_TIMESTAMP_SKEW',
      });
    }

    const method = (req.method || 'POST').toUpperCase();
    const path = req.originalUrl?.split('?')[0] || req.url?.split('?')[0] || '';
    const rawBody = req.rawBody ?? '';
    const stringToSign = `${timestamp}.${method}.${path}.${rawBody}`;
    const expectedSig = createHmac('sha256', expectedKey).update(stringToSign).digest('hex');

    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid HMAC signature',
        code: 'HUB_AUTH_BAD_SIGNATURE',
      });
    }

    // Body app_id must match header when present.
    const bodyApp = (req.body as { app_id?: string } | undefined)?.app_id;
    if (bodyApp && String(bodyApp).trim().toLowerCase() !== appId) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'app_id mismatch between header and body',
        code: 'HUB_APP_MISMATCH',
      });
    }

    req.hubAppId = appId;
    return true;
  }
}
