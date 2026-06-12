import { Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY, MOVA_EVENTS, serviceUrl } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './ratings.dto';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}
  async create(fromUserId: string, dto: CreateRatingDto) {
    const rating = await this.prisma.rating.create({ data: { rideId: dto.rideId, fromUserId, toUserId: dto.toUserId, score: dto.score, comment: dto.comment } });
    const avg = await this.prisma.rating.aggregate({ where: { toUserId: dto.toUserId }, _avg: { score: true } });
    if (avg._avg.score) {
      await fetch(serviceUrl('driver', `/internal/drivers/${dto.toUserId}/rating`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ ratingAvg: avg._avg.score }),
      });
      await this.redis.publish(MOVA_EVENTS.DRIVER_RATING_UPDATED, { userId: dto.toUserId, ratingAvg: avg._avg.score });
    }
    return rating;
  }
}
