import { HttpStatus, Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new MovaHttpException(MovaErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    return user;
  }

  async updateProfile(id: string, data: { firstName?: string; lastName?: string; email?: string }) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async listUsers(skip = 0, take = 50, search?: string) {
    const where = search?.trim()
      ? {
          OR: [
            { phone: { contains: search.trim(), mode: 'insensitive' as const } },
            { firstName: { contains: search.trim(), mode: 'insensitive' as const } },
            { lastName: { contains: search.trim(), mode: 'insensitive' as const } },
            { email: { contains: search.trim(), mode: 'insensitive' as const } },
          ],
        }
      : undefined;
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  private assertAssignableRole(role?: UserRole) {
    const allowed: UserRole[] = [
      UserRole.PASSENGER,
      UserRole.DRIVER,
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SUPPORT,
      UserRole.FINANCE,
      UserRole.CONTENT,
    ];
    if (role && !allowed.includes(role)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Rôle utilisateur invalide.');
    }
  }

  async updateAdmin(
    id: string,
    data: { role?: UserRole; phone?: string; status?: UserStatus; firstName?: string; lastName?: string },
  ) {
    await this.findById(id);
    this.assertAssignableRole(data.role);
    return this.prisma.user.update({ where: { id }, data });
  }

  async deactivateUser(id: string) {
    await this.findById(id);
    return this.prisma.user.update({ where: { id }, data: { status: UserStatus.SUSPENDED } });
  }
}
