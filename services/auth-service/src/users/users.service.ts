import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import {
  MovaErrorCode,
  MovaHttpException,
  OWNER_SUPER_ADMIN_PHONE,
  RedisService,
  denyJwtUser,
  formatMovaPublicId,
  maskPhoneRdc,
  normalizePhoneRdc,
  validatePhoneRdc,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private enrichUser(user: {
    id: string;
    phone: string | null;
    role: UserRole;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    status: UserStatus;
    avatarUrl?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...user,
      publicId: formatMovaPublicId(user.id, user.role),
      phoneMasked: maskPhoneRdc(user.phone),
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new MovaHttpException(MovaErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    return this.enrichUser(user);
  }

  async updateProfile(
    id: string,
    data: { firstName?: string | null; lastName?: string | null; email?: string | null },
  ) {
    const normalize = (value?: string | null) => (value == null ? null : value.trim() || null);
    const patch: { firstName?: string | null; lastName?: string | null; email?: string | null } = {};
    if (data.firstName !== undefined) patch.firstName = normalize(data.firstName);
    if (data.lastName !== undefined) patch.lastName = normalize(data.lastName);
    if (data.email !== undefined) patch.email = normalize(data.email);
    const user = await this.prisma.user.update({ where: { id }, data: patch });
    return this.enrichUser(user);
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
      UserRole.RESTAURANT,
      UserRole.RENTAL_PARTNER,
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

  async createAdmin(data: {
    phone: string;
    role: UserRole;
    firstName?: string;
    lastName?: string;
    status?: UserStatus;
  }) {
    const phone = normalizePhoneRdc(data.phone);
    if (!validatePhoneRdc(phone)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_INVALID_PHONE, HttpStatus.BAD_REQUEST);
    }
    this.assertAssignableRole(data.role);
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      const promotePassengerToPartner =
        existing.role === UserRole.PASSENGER &&
        (data.role === UserRole.RESTAURANT || data.role === UserRole.RENTAL_PARTNER);
      if (existing.role === data.role) {
        return this.enrichUser(
          await this.prisma.user.update({
            where: { id: existing.id },
            data: {
              status: data.status ?? existing.status,
              ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
              ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
            },
          }),
        );
      }
      if (promotePassengerToPartner) {
        return this.enrichUser(
          await this.prisma.user.update({
            where: { id: existing.id },
            data: {
              role: data.role,
              status: data.status ?? UserStatus.ACTIVE,
              ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
              ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
            },
          }),
        );
      }
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.CONFLICT,
        `Ce numéro existe déjà (rôle: ${existing.role}). Modifiez le rôle depuis la fiche utilisateur.`,
      );
    }
    const user = await this.prisma.user.create({
      data: {
        phone,
        role: data.role,
        status: data.status ?? (data.role === UserRole.DRIVER ? UserStatus.PENDING_KYC : UserStatus.ACTIVE),
        firstName: data.firstName,
        lastName: data.lastName,
      },
    });
    return this.enrichUser(user);
  }

  async updateAdmin(
    id: string,
    data: { role?: UserRole; phone?: string; status?: UserStatus; firstName?: string; lastName?: string },
  ) {
    const existing = await this.findById(id);
    this.assertAssignableRole(data.role);
    if (data.status === UserStatus.SUSPENDED) {
      this.assertNotOwnerSuspend(existing.phone);
    }
    const updated = await this.prisma.user.update({ where: { id }, data });
    if (data.status === UserStatus.SUSPENDED) {
      await this.denySuspendedUser(updated.id);
    }
    return updated;
  }

  async deactivateUser(id: string) {
    const existing = await this.findById(id);
    this.assertNotOwnerSuspend(existing.phone);
    const updated = await this.prisma.user.update({ where: { id }, data: { status: UserStatus.SUSPENDED } });
    await this.denySuspendedUser(updated.id);
    return updated;
  }

  private assertNotOwnerSuspend(phone?: string | null) {
    if (phone && normalizePhoneRdc(phone) === OWNER_SUPER_ADMIN_PHONE) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Impossible de suspendre le compte propriétaire SUPER_ADMIN.',
      );
    }
  }

  private async denySuspendedUser(userId: string) {
    if (!this.redis) return;
    try {
      await denyJwtUser(this.redis, userId);
    } catch {
      /* DB status already SUSPENDED; denylist is extra */
    }
  }
}
