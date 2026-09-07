import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import {
  MovaErrorCode,
  MovaHttpException,
  OWNER_SUPER_ADMIN_PHONE,
  userNeedsPinSetup,
  RedisService,
  denyJwtUser,
  formatMovaPublicId,
  maskEmail,
  maskPhoneRdc,
  normalizePhoneRdc,
  validatePhoneRdc,
  isDemoUserInsertForbidden,
  isPlayPrelaunchAccount,
  isSeedDemoPhone,
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
    googleId?: string | null;
    localPinHash?: string | null;
    role: UserRole;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    status: UserStatus;
    avatarUrl?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const { googleId, localPinHash: _pin, ...safe } = user;
    return {
      ...safe,
      publicId: formatMovaPublicId(user.id, user.role),
      phoneMasked: maskPhoneRdc(user.phone),
      emailMasked: maskEmail(user.email),
      googleLinked: Boolean(googleId),
      hasPhone: Boolean(user.phone),
      canUnlinkGoogle: Boolean(googleId && user.phone),
      canUnlinkPhone: Boolean(user.phone && googleId && user.phone !== OWNER_SUPER_ADMIN_PHONE),
      pinConfigured: Boolean(_pin),
      needsPinSetup: userNeedsPinSetup(user.phone, _pin),
      playPrelaunch: isPlayPrelaunchAccount(user),
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

  private async playPrelaunchUserIds(): Promise<string[]> {
    try {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM users
        WHERE phone IS NULL
          AND email IS NOT NULL
          AND (
            LOWER(email) LIKE '%@cloudtestlabaccounts.com'
            OR LOWER(email) ~ '^[a-z0-9]+([._][a-z0-9]+)*\\.[0-9]{5}@gmail\\.com$'
          )
      `;
      return rows.map((r) => r.id);
    } catch {
      const candidates = await this.prisma.user.findMany({
        where: { phone: null, NOT: { email: null } },
        select: { id: true, email: true, phone: true, firstName: true, lastName: true },
      });
      return candidates.filter(isPlayPrelaunchAccount).map((u) => u.id);
    }
  }

  private async hiddenAdminUserIds(includePlayPrelaunch: boolean): Promise<string[]> {
    const [playIds, demoRows] = await Promise.all([
      includePlayPrelaunch ? Promise.resolve([] as string[]) : this.playPrelaunchUserIds(),
      this.prisma.user.findMany({
        where: { phone: { startsWith: '+2439000000' } },
        select: { id: true, phone: true },
      }),
    ]);
    const demoIds = demoRows.filter((u) => u.phone && isSeedDemoPhone(u.phone)).map((u) => u.id);
    return [...new Set([...playIds, ...demoIds])];
  }

  async listUsers(skip = 0, take = 50, search?: string, includePlayPrelaunch = false) {
    const q = search?.trim();
    const roleFromSearch = this.roleFromSearch(q);
    const searchWhere = q
      ? {
          OR: [
            { phone: { contains: q, mode: 'insensitive' as const } },
            { firstName: { contains: q, mode: 'insensitive' as const } },
            { lastName: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            ...(roleFromSearch ? [{ role: roleFromSearch }] : []),
          ],
        }
      : undefined;
    const hiddenIds = await this.hiddenAdminUserIds(includePlayPrelaunch);
    const where =
      hiddenIds.length > 0
        ? { AND: [...(searchWhere ? [searchWhere] : []), { id: { notIn: hiddenIds } }] }
        : searchWhere;
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: data.map((u) => {
        const { googleId: _g, localPinHash, ...safe } = u;
        return {
          ...safe,
          playPrelaunch: isPlayPrelaunchAccount(u),
          pinConfigured: Boolean(localPinHash),
        };
      }),
      total,
      skip,
      take,
    };
  }

  private roleFromSearch(q?: string): UserRole | undefined {
    if (!q) return undefined;
    const key = q.trim().toLowerCase();
    const aliases: Record<string, UserRole> = {
      chauffeur: UserRole.DRIVER,
      chauffeurs: UserRole.DRIVER,
      driver: UserRole.DRIVER,
      passager: UserRole.PASSENGER,
      passenger: UserRole.PASSENGER,
      restaurant: UserRole.RESTAURANT,
      resto: UserRole.RESTAURANT,
      location: UserRole.RENTAL_PARTNER,
      loueur: UserRole.RENTAL_PARTNER,
      partenaire: UserRole.RENTAL_PARTNER,
      rental: UserRole.RENTAL_PARTNER,
      admin: UserRole.ADMIN,
    };
    if (aliases[key]) return aliases[key];
    const upper = q.trim().toUpperCase();
    return (Object.values(UserRole) as string[]).includes(upper) ? (upper as UserRole) : undefined;
  }

  async listPlayPrelaunchUsers() {
    const hiddenIds = await this.playPrelaunchUserIds();
    if (hiddenIds.length === 0) return { data: [], total: 0 };
    const data = await this.prisma.user.findMany({
      where: { id: { in: hiddenIds } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: data.filter(isPlayPrelaunchAccount).map((u) => {
        const { googleId: _g, localPinHash, ...safe } = u;
        return { ...safe, playPrelaunch: true, pinConfigured: Boolean(localPinHash) };
      }),
      total: data.filter(isPlayPrelaunchAccount).length,
    };
  }

  async purgePlayPrelaunchUsers(actorId?: string) {
    const { data } = await this.listPlayPrelaunchUsers();
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const user of data) {
      if (!isPlayPrelaunchAccount(user)) {
        skipped.push({ id: user.id, reason: 'hors motif Test Lab' });
        continue;
      }
      try {
        await this.purgeUser(user.id, actorId);
        deleted.push(user.id);
      } catch (e) {
        const body = e instanceof MovaHttpException ? e.getResponse() : null;
        const reason =
          body && typeof body === 'object' && 'message' in body
            ? String((body as { message?: string }).message)
            : 'refus de suppression';
        skipped.push({ id: user.id, reason });
      }
    }
    return { deleted: deleted.length, ids: deleted, skipped };
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
    if (isDemoUserInsertForbidden(phone)) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Les comptes démo (+2439000000xx) ne peuvent pas être créés en production.',
      );
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

  async purgeUser(id: string, actorId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (actorId && existing.id === actorId) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Vous ne pouvez pas supprimer votre propre compte.',
      );
    }
    this.assertNotOwnerDelete(existing.phone);
    if (existing.role === UserRole.SUPER_ADMIN) {
      const superAdmins = await this.prisma.user.count({ where: { role: UserRole.SUPER_ADMIN } });
      if (superAdmins <= 1) {
        throw new MovaHttpException(
          MovaErrorCode.AUTH_FORBIDDEN,
          HttpStatus.FORBIDDEN,
          'Impossible de supprimer le dernier compte SUPER_ADMIN.',
        );
      }
    }
    if (existing.phone) {
      await this.prisma.otpCode.deleteMany({ where: { phone: existing.phone } });
    }
    await this.denySuspendedUser(existing.id);
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true, id };
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

  private assertNotOwnerDelete(phone?: string | null) {
    if (phone && normalizePhoneRdc(phone) === OWNER_SUPER_ADMIN_PHONE) {
      throw new MovaHttpException(
        MovaErrorCode.AUTH_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'Impossible de supprimer le compte propriétaire SUPER_ADMIN.',
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
