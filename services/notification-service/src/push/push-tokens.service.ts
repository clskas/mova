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

  async tokensForUsers(userIds: string[], appFlavor = 'driver'): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.pushDevice.findMany({
      where: { userId: { in: userIds }, appFlavor },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  async removeToken(token: string) {
    return this.prisma.pushDevice.deleteMany({ where: { token } });
  }
}
