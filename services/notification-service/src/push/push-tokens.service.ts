import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushTokensService {
  constructor(private prisma: PrismaService) {}

  async register(userId: string, token: string, platform?: string, appFlavor = 'driver', language?: string) {
    const lang = language === 'en' ? 'en' : language === 'fr' ? 'fr' : undefined;
    return this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token, platform, appFlavor, ...(lang ? { language: lang } : {}) },
      update: { userId, platform, appFlavor, ...(lang ? { language: lang } : {}), updatedAt: new Date() },
    });
  }

  /** Tokens whose device runs the app in English. */
  async englishTokens(tokens: string[]): Promise<Set<string>> {
    if (tokens.length === 0) return new Set();
    const rows = await this.prisma.pushDevice.findMany({
      where: { token: { in: tokens }, language: 'en' },
      select: { token: true },
    });
    return new Set(rows.map((r) => r.token));
  }

  async tokensForUsers(
    userIds: string[],
    appFlavor = 'driver',
    platform?: string,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const platformFilter =
      platform?.toLowerCase() === 'ios'
        ? { platform: { in: ['ios', 'iOS', 'IOS'] } }
        : platform?.toLowerCase() === 'android'
          ? { platform: { in: ['android', 'Android', 'ANDROID'] } }
          : platform
            ? { platform }
            : {};
    const rows = await this.prisma.pushDevice.findMany({
      where: {
        userId: { in: userIds },
        appFlavor,
        ...platformFilter,
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
