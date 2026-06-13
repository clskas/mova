import { HttpStatus, Injectable } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { INTERNAL_API_KEY, MOVA_EVENTS, MovaErrorCode, MovaHttpException, serviceUrl } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './ratings.dto';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async create(fromUserId: string, dto: CreateRatingDto) {
    const ride = await this.prisma.ride.findUnique({ where: { id: dto.rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.status !== RideStatus.COMPLETED) throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    if (fromUserId !== ride.passengerId && fromUserId !== ride.driverId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    if (dto.toUserId !== ride.passengerId && dto.toUserId !== ride.driverId) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
    }
    if (dto.toUserId === fromUserId) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);

    const existing = await this.prisma.rating.findUnique({
      where: { rideId_fromUserId: { rideId: dto.rideId, fromUserId } },
    });
    if (existing) throw new MovaHttpException(MovaErrorCode.RIDE_ALREADY_RATED);

    const rating = await this.prisma.rating.create({
      data: { rideId: dto.rideId, fromUserId, toUserId: dto.toUserId, score: dto.score, comment: dto.comment },
    });
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
