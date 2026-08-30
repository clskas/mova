import { MovaErrorCode, OWNER_SUPER_ADMIN_PHONE, UserRole, UserStatus } from '@mova/shared';
import { UsersService } from './users.service';

describe('UsersService owner lock', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const redis = { client: { set: jest.fn().mockResolvedValue('OK') } };
  const service = new UsersService(prisma as never, redis as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'owner-1',
      phone: OWNER_SUPER_ADMIN_PHONE,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    });
  });

  it('refuses to suspend SUPER_ADMIN +243971163574', async () => {
    await expect(service.deactivateUser('owner-1')).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses status=SUSPENDED on the owner via updateAdmin', async () => {
    await expect(service.updateAdmin('owner-1', { status: UserStatus.SUSPENDED })).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
