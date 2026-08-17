import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { afrisoftPayHubVerifySignature } from '@mova/shared';
import { HubAppsRegistry } from './hub-apps.registry';

@Injectable()
export class HubHmacGuard implements CanActivate {
  constructor(private readonly apps: HubAppsRegistry) {}

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

    const method = (req.method || 'POST').toUpperCase();
    const path = req.originalUrl?.split('?')[0] || req.url?.split('?')[0] || '';
    const rawBody = req.rawBody ?? '';
    if (
      !afrisoftPayHubVerifySignature({
        secret: expectedKey,
        timestamp,
        method,
        path,
        rawBody,
        signature,
      })
    ) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid HMAC signature',
        code: 'HUB_AUTH_BAD_SIGNATURE',
      });
    }

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
