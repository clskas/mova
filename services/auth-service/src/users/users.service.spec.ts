import { MovaErrorCode, OWNER_SUPER_ADMIN_PHONE, UserRole, UserStatus } from '@mova/shared';
import { UsersService } from './users.service';

describe('UsersService owner lock', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    otpCode: {
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
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

  it('refuses to purge the owner SUPER_ADMIN', async () => {
    await expect(service.purgeUser('owner-1', 'admin-2')).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses to purge yourself', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-2',
      phone: '+243810000001',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    await expect(service.purgeUser('admin-2', 'admin-2')).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses to purge the last SUPER_ADMIN', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'sa-2',
      phone: '+243810000002',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    });
    prisma.user.count.mockResolvedValue(1);
    await expect(service.purgeUser('sa-2', 'admin-2')).rejects.toMatchObject({
      response: { code: MovaErrorCode.AUTH_FORBIDDEN },
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('hard-deletes a passenger so they can re-register', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'pax-1',
      phone: '+243810000099',
      role: UserRole.PASSENGER,
      status: UserStatus.ACTIVE,
    });
    prisma.otpCode.deleteMany.mockResolvedValue({ count: 2 });
    prisma.user.delete.mockResolvedValue({ id: 'pax-1' });
    await expect(service.purgeUser('pax-1', 'admin-2')).resolves.toEqual({ deleted: true, id: 'pax-1' });
    expect(prisma.otpCode.deleteMany).toHaveBeenCalledWith({ where: { phone: '+243810000099' } });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'pax-1' } });
  });

  it('hides Play Test Lab accounts from the default user list', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'bot-1' }]);
    prisma.user.findMany.mockImplementation(async (args: { where?: { phone?: { startsWith?: string } } }) => {
      if (args?.where?.phone?.startsWith === '+2439000000') return [];
      return [{ id: 'real-1', email: 'celestinkas@gmail.com', phone: '+243971163574', firstName: 'Célestin' }];
    });
    prisma.user.count.mockResolvedValue(1);
    const result = await service.listUsers(0, 50);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ id: { notIn: ['bot-1'] } }] },
      }),
    );
    expect(result.total).toBe(1);
    expect(result.data[0].playPrelaunch).toBe(false);
  });

  it('lists Play Test Lab rows when includePlayPrelaunch is true', async () => {
    prisma.user.findMany.mockImplementation(async (args: { where?: { phone?: { startsWith?: string } } }) => {
      if (args?.where?.phone?.startsWith === '+2439000000') return [];
      return [
        {
          id: 'bot-1',
          email: 'martinpearson.39569@gmail.com',
          phone: null,
          firstName: 'Martin',
          lastName: 'Pearson',
        },
      ];
    });
    prisma.user.count.mockResolvedValue(1);
    const result = await service.listUsers(0, 50, undefined, true);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result.data[0].playPrelaunch).toBe(true);
  });

  it('refuses to purge a Play bot that does not match the safe pattern', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'real-gmail' }]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'real-gmail', email: 'marie.kabila@gmail.com', phone: null, firstName: 'Marie', lastName: 'Kabila' },
    ]);
    const result = await service.purgePlayPrelaunchUsers('admin-2');
    expect(result.deleted).toBe(0);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
