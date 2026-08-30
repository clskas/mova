import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: Error | null, user: TUser): TUser {
    if (err instanceof ServiceUnavailableException) throw err;
    if (err || !user) throw err || new UnauthorizedException();
    return user;
  }
}
