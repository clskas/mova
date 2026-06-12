import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY } from '@mova/shared';
@Injectable()
export class InternalApiGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    return req.headers['x-internal-api-key'] === INTERNAL_API_KEY;
  }
}
