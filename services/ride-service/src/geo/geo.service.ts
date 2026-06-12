import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class GeoService {
  constructor(private prisma: PrismaService) {}
  getCommunes(city = 'Kinshasa') { return this.prisma.commune.findMany({ where: { city }, orderBy: { name: 'asc' } }); }
}
