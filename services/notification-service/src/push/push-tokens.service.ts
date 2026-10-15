import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushTokensService {
  constructor(private prisma: PrismaService) {}

  async register(userId: string, token: string, platform?: string, appFlavor = 'driver') {
    return this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token, platform, appFlavor },
      update: { userId, platform, appFlavor, updatedAt: new Date() },
    });
  }

  async tokensForUsers(
    userIds: string[],
    appFlavor = 'driver',
    platform?: string,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.pushDevice.findMany({
      where: {
        userId: { in: userIds },
        appFlavor,
        ...(platform
          ? { platform: { equals: platform, mode: 'insensitive' as const } }
          : {}),
      },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  /** User IDs among [userIds] that have at least one FCM token for [appFlavor]. */
  async userIdsWithTokens(userIds: string[], appFlavor = 'driver'): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.pushDevice.findMany({
      where: { userId: { in: userIds }, appFlavor },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  /** Tous les tokens FCM d’un utilisateur (passenger + driver) — requis pour SOS. */
  async tokensForUsersAnyFlavor(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.pushDevice.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    return [...new Set(rows.map((r) => r.token))];
  }

  async removeToken(token: string) {
    return this.prisma.pushDevice.deleteMany({ where: { token } });
  }
}
