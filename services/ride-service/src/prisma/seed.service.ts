import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SurchargeType, VehicleType } from '@prisma/client';
import { DRC_SERVICE_AREAS, getCommunesForArea, KINSHASA_COMMUNES, MARKET_RDC } from '@mova/shared';
import { PrismaService } from './prisma.service';

const PRICING_RULES = [
  { vehicleType: VehicleType.MOTO_TAXI, baseFareCdf: 1500, perKmCdf: 800, perMinuteCdf: 100, minFareCdf: 2000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.STANDARD, baseFareCdf: 3000, perKmCdf: 1500, perMinuteCdf: 200, minFareCdf: 5000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.COMFORT, baseFareCdf: 5000, perKmCdf: 2500, perMinuteCdf: 300, minFareCdf: 8000, peakMultiplier: 1.4, nightMultiplier: 1.3 },
  { vehicleType: VehicleType.VIP, baseFareCdf: 8000, perKmCdf: 3500, perMinuteCdf: 400, minFareCdf: 12000, peakMultiplier: 1.5, nightMultiplier: 1.4 },
];

const SEED_CITIES = ['Kinshasa', 'Lubumbashi', 'Goma'] as const;

const CANCELLATION_POLICIES = [
  { vehicleType: VehicleType.MOTO_TAXI, freeCancelMinutes: 2, passengerFeeCdf: 1000, driverCompensationCdf: 500, noShowFeeCdf: 2000 },
  { vehicleType: VehicleType.STANDARD, freeCancelMinutes: 3, passengerFeeCdf: 2000, driverCompensationCdf: 1000, noShowFeeCdf: 5000 },
  { vehicleType: VehicleType.COMFORT, freeCancelMinutes: 5, passengerFeeCdf: 3000, driverCompensationCdf: 1500, noShowFeeCdf: 8000 },
  { vehicleType: VehicleType.VIP, freeCancelMinutes: 5, passengerFeeCdf: 5000, driverCompensationCdf: 2500, noShowFeeCdf: 10000 },
];

const RESTAURANTS = [
  { name: 'Chez Flore', cuisine: 'Congolais', address: 'Avenue Batetela, Gombe, Kinshasa', lat: -4.3105, lng: 15.3032, rating: 4.6, imageUrl: 'https://cdn.mova.cd/restaurants/chez-flore.jpg', menuItems: [{ name: 'Poulet moambe', unitPriceCdf: 12000 }] },
  { name: 'Limoncello', cuisine: 'Italien', address: 'Boulevard du 30 Juin, Gombe, Kinshasa', lat: -4.3189, lng: 15.3098, rating: 4.5, imageUrl: 'https://cdn.mova.cd/restaurants/limoncello.jpg', menuItems: [{ name: 'Pizza Margherita', unitPriceCdf: 18000 }] },
  { name: 'Planet Hollybum', cuisine: 'Fast-food', address: 'Avenue de la Justice, Gombe, Kinshasa', lat: -4.3251, lng: 15.3124, rating: 4.2, imageUrl: 'https://cdn.mova.cd/restaurants/planet-hollybum.jpg', menuItems: [{ name: 'Burger classique', unitPriceCdf: 10000 }] },
  { name: 'Le Roxy', cuisine: 'Grill', address: 'Avenue Likasi, Lubumbashi', lat: -11.664, lng: 27.48, rating: 4.3, imageUrl: 'https://cdn.mova.cd/restaurants/roxy.jpg', menuItems: [{ name: 'Brochettes', unitPriceCdf: 14000 }] },
  { name: 'Cafe Goma', cuisine: 'Café', address: 'Avenue du Lac, Goma', lat: -1.678, lng: 29.218, rating: 4.4, imageUrl: 'https://cdn.mova.cd/restaurants/cafe-goma.jpg', menuItems: [{ name: 'Petit-déjeuner', unitPriceCdf: 8000 }] },
];

const RENTAL_VEHICLES = [
  { name: 'Toyota Corolla', category: 'Berline', seats: 5, dailyRateCdf: 45000, depositCdf: 100000 },
  { name: 'Toyota RAV4', category: 'SUV', seats: 5, dailyRateCdf: 75000, depositCdf: 150000 },
  { name: 'Honda CB125', category: 'Moto', seats: 2, dailyRateCdf: 15000, depositCdf: 50000 },
  { name: 'Toyota Hiace', category: 'Minibus', seats: 14, dailyRateCdf: 120000, depositCdf: 200000 },
];

const SERVICE_SURCHARGES = [
  { type: SurchargeType.DELIVERY_PARCEL, baseFeeCdf: 0, multiplier: 1.0, description: 'Colis — multiplicateur poids appliqué au tarif course' },
  { type: SurchargeType.DELIVERY_FOOD, baseFeeCdf: 3000, multiplier: 1.0, description: 'Livraison repas — frais de base CDF' },
  { type: SurchargeType.DELIVERY_EXPRESS, baseFeeCdf: 0, multiplier: 1.35, description: 'Livraison express — majoration 35%' },
  { type: SurchargeType.MOVING, baseFeeCdf: 15000, multiplier: 1.5, perUnitCdf: 8000, description: 'Déménagement — base + majoration course + CDF/m³' },
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
      await this.prisma.commune.upsert({
        where: { name_city: { name: c.name, city: MARKET_RDC.defaultCity } },
        create: { name: c.name, city: MARKET_RDC.defaultCity, lat: c.lat, lng: c.lng },
        update: { lat: c.lat, lng: c.lng },
      });
    }

    for (const area of DRC_SERVICE_AREAS) {
      if (area.id === 'kinshasa') continue;
      for (const d of getCommunesForArea(area.id)) {
        await this.prisma.commune.upsert({
          where: { name_city: { name: d.name, city: area.name } },
          create: { name: d.name, city: area.name, lat: d.lat, lng: d.lng },
          update: { lat: d.lat, lng: d.lng },
        });
      }
    }

    for (const city of SEED_CITIES) {
      for (const r of PRICING_RULES) {
        await this.prisma.pricingRule.upsert({
          where: { vehicleType_city: { vehicleType: r.vehicleType, city } },
          create: { ...r, city },
          update: r,
        });
      }
    }

    for (const s of SERVICE_SURCHARGES) {
      await this.prisma.serviceSurcharge.upsert({ where: { type: s.type }, create: s, update: s });
    }
    for (const p of CANCELLATION_POLICIES) {
      await this.prisma.cancellationPolicy.upsert({ where: { vehicleType: p.vehicleType }, create: p, update: p });
    }
    for (const r of RESTAURANTS) {
      const existing = await this.prisma.restaurant.findFirst({ where: { name: r.name } });
      if (existing) await this.prisma.restaurant.update({ where: { id: existing.id }, data: r });
      else await this.prisma.restaurant.create({ data: r });
    }
    for (const v of RENTAL_VEHICLES) {
      const existing = await this.prisma.rentalVehicle.findFirst({ where: { name: v.name } });
      if (existing) await this.prisma.rentalVehicle.update({ where: { id: existing.id }, data: v });
      else await this.prisma.rentalVehicle.create({ data: v });
    }
    this.logger.log('Ride service seed data ensured');
  }
}
