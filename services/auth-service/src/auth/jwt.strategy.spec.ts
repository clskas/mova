import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@mova/shared';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue('dev_secret') };
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    jest.clearAllMocks();
    strategy = new JwtStrategy(config as never, prisma as never);
  });

  it('rejects a missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 'gone', role: UserRole.PASSENGER, status: UserStatus.ACTIVE }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a SUSPENDED user even if the JWT still says ACTIVE', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      phone: '+243811111111',
      role: UserRole.PASSENGER,
      status: UserStatus.SUSPENDED,
    });
    await expect(
      strategy.validate({ sub: 'user-1', role: UserRole.PASSENGER, status: UserStatus.ACTIVE }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns live role and status from the database', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      phone: '+243811111111',
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_KYC,
    });
    const result = await strategy.validate({
      sub: 'user-1',
      phone: '+243811111111',
      role: UserRole.PASSENGER,
      status: UserStatus.ACTIVE,
    });
    expect(result).toEqual({
      id: 'user-1',
      phone: '+243811111111',
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_KYC,
    });
  });
});
