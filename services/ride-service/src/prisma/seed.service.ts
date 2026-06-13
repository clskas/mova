import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { KINSHASA_COMMUNES } from '@mova/shared';
import { PrismaService } from './prisma.service';

const PRICING_RULES = [
  { vehicleType: VehicleType.MOTO_TAXI, baseFareCdf: 1500, perKmCdf: 800, perMinuteCdf: 100, minFareCdf: 2000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.STANDARD, baseFareCdf: 3000, perKmCdf: 1500, perMinuteCdf: 200, minFareCdf: 5000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.COMFORT, baseFareCdf: 5000, perKmCdf: 2500, perMinuteCdf: 300, minFareCdf: 8000, peakMultiplier: 1.4, nightMultiplier: 1.3 },
];

const RESTAURANTS = [
  { name: 'Chez Flore', cuisine: 'Congolais', address: 'Avenue Batetela, Gombe, Kinshasa', lat: -4.3105, lng: 15.3032, rating: 4.6, imageUrl: 'https://cdn.mova.cd/restaurants/chez-flore.jpg', menuItems: [{ name: 'Poulet moambe', unitPriceCdf: 12000 }] },
  { name: 'Limoncello', cuisine: 'Italien', address: 'Boulevard du 30 Juin, Gombe, Kinshasa', lat: -4.3189, lng: 15.3098, rating: 4.5, imageUrl: 'https://cdn.mova.cd/restaurants/limoncello.jpg', menuItems: [{ name: 'Pizza Margherita', unitPriceCdf: 18000 }] },
  { name: 'Planet Hollybum', cuisine: 'Fast-food', address: 'Avenue de la Justice, Gombe, Kinshasa', lat: -4.3251, lng: 15.3124, rating: 4.2, imageUrl: 'https://cdn.mova.cd/restaurants/planet-hollybum.jpg', menuItems: [{ name: 'Burger classique', unitPriceCdf: 10000 }] },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensureSeedData();
    } catch (err) {
      this.logger.warn('Seed skipped (DB may not be ready yet)', err);
    }
  }

  async ensureSeedData() {
    for (const c of KINSHASA_COMMUNES) {
      await this.prisma.commune.upsert({ where: { name: c.name }, create: { name: c.name, lat: c.lat, lng: c.lng }, update: { lat: c.lat, lng: c.lng } });
    }
    for (const r of PRICING_RULES) {
      await this.prisma.pricingRule.upsert({ where: { vehicleType: r.vehicleType }, create: r, update: r });
    }
    for (const r of RESTAURANTS) {
      const existing = await this.prisma.restaurant.findFirst({ where: { name: r.name } });
      if (existing) await this.prisma.restaurant.update({ where: { id: existing.id }, data: r });
      else await this.prisma.restaurant.create({ data: r });
    }
    this.logger.log('Ride service seed data ensured');
  }
}
