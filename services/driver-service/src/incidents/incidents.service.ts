import { Injectable } from '@nestjs/common';
import { IncidentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class IncidentsService {
  constructor(private prisma: PrismaService) {}
  async create(userId: string, type: IncidentType, description: string, rideId?: string) {
    return this.prisma.incident.create({ data: { userId, type, description, rideId } });
  }
  async list() { return this.prisma.incident.findMany({ orderBy: { createdAt: 'desc' } }); }
  async resolve(id: string, status: string) { return this.prisma.incident.update({ where: { id }, data: { status } }); }
  async countOpen() { return this.prisma.incident.count({ where: { status: 'OPEN' } }); }
}
