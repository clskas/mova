import { Injectable } from '@nestjs/common';
import { IncidentType } from '@prisma/client';
import { MOVA_EVENTS, IncidentCreatedPayload } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

export type CreateIncidentInput = {
  userId: string;
  type: IncidentType;
  description: string;
  rideId?: string;
  lat?: number;
  lng?: number;
  referenceType?: string;
  referenceId?: string;
  isEmergency?: boolean;
};

@Injectable()
export class IncidentsService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async create(input: CreateIncidentInput) {
    const isEmergency = input.isEmergency ?? input.type === IncidentType.SOS;
    const incident = await this.prisma.incident.create({
      data: {
        userId: input.userId,
        type: input.type,
        description: input.description,
        rideId: input.rideId,
        lat: input.lat,
        lng: input.lng,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        isEmergency,
      },
    });
    const payload: IncidentCreatedPayload = {
      incidentId: incident.id,
      userId: incident.userId,
      type: incident.type,
      rideId: incident.rideId ?? undefined,
      referenceType: incident.referenceType ?? undefined,
      referenceId: incident.referenceId ?? undefined,
      lat: incident.lat ?? undefined,
      lng: incident.lng ?? undefined,
      isEmergency: incident.isEmergency,
    };
    try {
      await this.redis.publish(MOVA_EVENTS.INCIDENT_CREATED, payload);
    } catch {
      /* non-blocking */
    }
    return incident;
  }

  async list() {
    return this.prisma.incident.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async resolve(id: string, status: string) {
    return this.prisma.incident.update({ where: { id }, data: { status } });
  }

  async countOpen() {
    return this.prisma.incident.count({ where: { status: 'OPEN' } });
  }
}
