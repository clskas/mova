import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY, timingSafeEqualString } from '@mova/shared';

@Injectable()
export class InternalApiGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const header = ctx.switchToHttp().getRequest().headers['x-internal-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;
    return timingSafeEqualString(typeof provided === 'string' ? provided : '', INTERNAL_API_KEY);
  }
}
