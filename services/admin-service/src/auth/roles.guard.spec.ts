import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminPermission, MovaErrorCode, UserRole } from '@mova/shared';
import { RolesGuard } from './roles.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new RolesGuard(reflector);

  function ctx(role: string): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  }

  beforeEach(() => jest.clearAllMocks());

  it('autorise SUPPORT pour KYC lecture', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([AdminPermission.KYC_READ]);
    expect(guard.canActivate(ctx(UserRole.SUPPORT))).toBe(true);
  });

  it('refuse CONTENT pour modification utilisateurs', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([AdminPermission.USERS_WRITE]);
    expect(() => guard.canActivate(ctx(UserRole.CONTENT))).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: MovaErrorCode.AUTH_FORBIDDEN }) }),
    );
  });

  it('laisse passer sans metadata permissions', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    expect(guard.canActivate(ctx(UserRole.PASSENGER))).toBe(true);
  });
});
