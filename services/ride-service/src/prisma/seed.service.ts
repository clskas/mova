import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CommissionServiceType, ErrandCategory, MovingVehicleCategory, SurchargeType, VehicleType } from '@prisma/client';
import { DRC_SERVICE_AREAS, getCommunesForArea, KINSHASA_COMMUNES, setCityActivationOverrides } from '@mova/shared';
import { MOVING_VEHICLE_CATEGORY_DEFAULTS } from '../moving/moving-vehicle-pricing.service';
import { PARCEL_WEIGHT_BAND_DEFAULTS } from '../platform/parcel-weight-band.service';
import { PricingTimeWindowService } from '../rides/pricing-time-window.service';
import { PrismaService } from './prisma.service';

const PRICING_RULES = [
  { vehicleType: VehicleType.MOTO_TAXI, baseFareCdf: 1500, perKmCdf: 800, perMinuteCdf: 100, minFareCdf: 2000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.STANDARD, baseFareCdf: 3000, perKmCdf: 1500, perMinuteCdf: 200, minFareCdf: 5000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.COMFORT, baseFareCdf: 5000, perKmCdf: 2500, perMinuteCdf: 300, minFareCdf: 8000, peakMultiplier: 1.4, nightMultiplier: 1.3 },
  { vehicleType: VehicleType.VIP, baseFareCdf: 8000, perKmCdf: 3500, perMinuteCdf: 400, minFareCdf: 12000, peakMultiplier: 1.5, nightMultiplier: 1.4 },
];

const SEED_CITIES = DRC_SERVICE_AREAS.map((a) => a.name);

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
  {
    name: 'Toyota Corolla',
    make: 'Toyota',
    model: 'Corolla',
    year: 2021,
    category: 'ECONOMY',
    transmission: 'MANUAL',
    city: 'Kinshasa',
    seats: 5,
    dailyRateCdf: 45000,
    depositCdf: 100000,
    weeklyDiscountPct: 10,
    rating: 4.6,
    ownerName: 'Jean K.',
    ownerBadge: 'PRO',
    ownerContactPhone: '+243812345678',
    features: ['Climatisation', 'Bluetooth', 'Essence'],
    cancellationPolicy: 'Annulation gratuite 24 h avant prise en charge.',
    mileageUnlimited: true,
    limitedMileageFeeCdf: 15000,
  },
  {
    name: 'Toyota RAV4',
    make: 'Toyota',
    model: 'RAV4',
    year: 2022,
    category: 'SUV',
    transmission: 'AUTO',
    city: 'Kinshasa',
    seats: 5,
    dailyRateCdf: 75000,
    depositCdf: 150000,
    weeklyDiscountPct: 12,
    rating: 4.8,
    ownerName: 'Marie L.',
    ownerBadge: 'SUPER_HOST',
    ownerContactPhone: '+243898765432',
    features: ['Climatisation', 'GPS', '4x4', 'Diesel'],
    cancellationPolicy: 'Annulation gratuite 48 h avant prise en charge.',
    mileageUnlimited: true,
    limitedMileageFeeCdf: 20000,
  },
  {
    name: 'Mercedes Classe C',
    make: 'Mercedes',
    model: 'Classe C',
    year: 2023,
    category: 'PREMIUM',
    transmission: 'AUTO',
    city: 'Kinshasa',
    seats: 5,
    dailyRateCdf: 120000,
    depositCdf: 250000,
    weeklyDiscountPct: 15,
    rating: 4.9,
    ownerName: 'MOVA Fleet',
    ownerBadge: 'PRO',
    ownerContactPhone: '+243900000000',
    features: ['Climatisation', 'GPS', 'Cuir', 'Toit ouvrant', 'Essence'],
    cancellationPolicy: 'Annulation gratuite 72 h avant prise en charge.',
    mileageUnlimited: false,
    limitedMileageFeeCdf: 25000,
  },
  {
    name: 'Honda CB125',
    make: 'Honda',
    model: 'CB125',
    year: 2020,
    category: 'ECONOMY',
    transmission: 'MANUAL',
    city: 'Kinshasa',
    seats: 2,
    dailyRateCdf: 15000,
    depositCdf: 50000,
    weeklyDiscountPct: 5,
    rating: 4.4,
    ownerName: 'Paul M.',
    ownerBadge: null,
    ownerContactPhone: '+243811122233',
    features: ['Casque inclus'],
    cancellationPolicy: 'Annulation gratuite 24 h avant prise en charge.',
    mileageUnlimited: true,
    limitedMileageFeeCdf: 8000,
  },
  {
    name: 'Toyota Hiace',
    make: 'Toyota',
    model: 'Hiace',
    year: 2019,
    category: 'SUV',
    transmission: 'MANUAL',
    city: 'Lubumbashi',
    seats: 14,
    dailyRateCdf: 120000,
    depositCdf: 200000,
    weeklyDiscountPct: 10,
    rating: 4.5,
    ownerName: 'Transport Kasaï',
    ownerBadge: 'PRO',
    ownerContactPhone: '+243855566677',
    features: ['Climatisation', 'GPS', 'Diesel'],
    cancellationPolicy: 'Annulation gratuite 24 h avant prise en charge.',
    mileageUnlimited: true,
    limitedMileageFeeCdf: 30000,
  },
  {
    name: 'Isuzu NPR Utilitaire',
    make: 'Isuzu',
    model: 'NPR',
    year: 2018,
    category: 'VAN',
    transmission: 'MANUAL',
    city: 'Kinshasa',
    seats: 3,
    dailyRateCdf: 95000,
    depositCdf: 180000,
    weeklyDiscountPct: 8,
    rating: 4.5,
    ownerName: 'MOVA Fleet',
    ownerBadge: 'PRO',
    ownerContactPhone: '+243900000000',
    features: ['Hayon', 'GPS', 'Diesel', 'Assistance routière'],
    cancellationPolicy: 'Annulation gratuite 48 h avant prise en charge.',
    mileageUnlimited: false,
    limitedMileageFeeCdf: 20000,
  },
];

const SERVICE_SURCHARGES = [
  { type: SurchargeType.DELIVERY_PARCEL, baseFeeCdf: 0, multiplier: 1.0, description: 'Colis — multiplicateur poids appliqué au tarif course' },
  { type: SurchargeType.DELIVERY_FOOD, baseFeeCdf: 3000, multiplier: 1.0, description: 'Livraison repas — frais de base CDF' },
  { type: SurchargeType.DELIVERY_EXPRESS, baseFeeCdf: 0, multiplier: 1.35, description: 'Livraison express — majoration 35%' },
  { type: SurchargeType.MOVING, baseFeeCdf: 15000, multiplier: 1.5, perUnitCdf: 8000, description: 'Déménagement — base + majoration course + CDF/m³' },
];

const PLATFORM_COMMISSIONS = [
  { serviceType: CommissionServiceType.RIDE, platformPercent: 15, driverPercent: 85, description: 'Courses taxi / moto' },
  { serviceType: CommissionServiceType.DELIVERY, platformPercent: 20, driverPercent: 80, description: 'Livraisons' },
  { serviceType: CommissionServiceType.MOVING, platformPercent: 18, driverPercent: 82, description: 'Déménagements' },
  { serviceType: CommissionServiceType.RENTAL, platformPercent: 12, driverPercent: 88, description: 'Location véhicule' },
  { serviceType: CommissionServiceType.CARPOOL, platformPercent: 10, driverPercent: 90, description: 'Covoiturage' },
  {
    serviceType: CommissionServiceType.ERRAND,
    platformPercent: 15,
    driverPercent: 85,
    fixedFeeCdf: 2500,
    perItemFeeCdf: 1500,
    description: 'Courses & commissions',
  },
  {
    serviceType: CommissionServiceType.FOOD,
    platformPercent: 12,
    driverPercent: 88,
    description: 'Ventes repas — restaurants partenaires',
  },
];

const ERRAND_CATEGORY_ESTIMATES = [
  {
    category: ErrandCategory.PHARMACY,
    label: 'Pharmacie',
    perItemCdf: 8000,
    keywordPattern: 'pharmac|médic|medic|drug|para-?pharm',
    sortOrder: 1,
  },
  {
    category: ErrandCategory.MARKET,
    label: 'Marché',
    perItemCdf: 3000,
    keywordPattern: 'marché|marche|market|supermarch|commerce|épicer|epicer|boutique',
    sortOrder: 2,
  },
  {
    category: ErrandCategory.OTHER,
    label: 'Autre',
    perItemCdf: 5000,
    keywordPattern: null,
    sortOrder: 3,
  },
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

  private async seedSection(label: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`Seed section "${label}" failed`, err);
    }
  }

  async ensureSeedData() {
    await this.seedSection('provinces-cities', async () => {
      const provinceIds = new Map<string, string>();
      for (const area of DRC_SERVICE_AREAS) {
        let provinceId = provinceIds.get(area.province);
        if (!provinceId) {
          const p = await this.prisma.province.upsert({
            where: { name: area.province },
            create: { name: area.province, isActive: true },
            update: {},
          });
          provinceId = p.id;
          provinceIds.set(area.province, provinceId);
        }
        const b = area.bounds;
        await this.prisma.city.upsert({
          where: { slug: area.id },
          create: {
            slug: area.id,
            name: area.name,
            provinceId,
            centerLat: area.centerLat,
            centerLng: area.centerLng,
            minLat: b.minLat,
            maxLat: b.maxLat,
            minLng: b.minLng,
            maxLng: b.maxLng,
            isActive: area.active,
          },
          update: {
            name: area.name,
            provinceId,
            centerLat: area.centerLat,
            centerLng: area.centerLng,
            minLat: b.minLat,
            maxLat: b.maxLat,
            minLng: b.minLng,
            maxLng: b.maxLng,
          },
        });
      }
      const cities = await this.prisma.city.findMany({
        select: { slug: true, name: true, isActive: true },
      });
      setCityActivationOverrides(cities);
    });

    await this.seedSection('communes', async () => {
      for (const c of KINSHASA_COMMUNES) {
        await this.prisma.commune.upsert({
          where: { name_city: { name: c.name, city: 'Kinshasa' } },
          create: { name: c.name, city: 'Kinshasa', lat: c.lat, lng: c.lng },
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
    });

    await this.seedSection('pricing', async () => {
      for (const city of SEED_CITIES) {
        for (const r of PRICING_RULES) {
          await this.prisma.pricingRule.upsert({
            where: { vehicleType_city: { vehicleType: r.vehicleType, city } },
            create: { ...r, city },
            update: r,
          });
        }
      }
    });

    await this.seedSection('surcharges', async () => {
      for (const s of SERVICE_SURCHARGES) {
        await this.prisma.serviceSurcharge.upsert({ where: { type: s.type }, create: s, update: s });
      }
      for (const p of CANCELLATION_POLICIES) {
        await this.prisma.cancellationPolicy.upsert({ where: { vehicleType: p.vehicleType }, create: p, update: p });
      }
      for (const c of PLATFORM_COMMISSIONS) {
        await this.prisma.platformCommission.upsert({
          where: { serviceType: c.serviceType },
          create: c,
          update: {
            platformPercent: c.platformPercent,
            driverPercent: c.driverPercent,
            description: c.description,
            ...(c.fixedFeeCdf != null ? { fixedFeeCdf: c.fixedFeeCdf } : {}),
            ...(c.perItemFeeCdf != null ? { perItemFeeCdf: c.perItemFeeCdf } : {}),
          },
        });
      }
      for (const row of ERRAND_CATEGORY_ESTIMATES) {
        await this.prisma.errandCategoryEstimate.upsert({
          where: { category: row.category },
          create: row,
          update: {
            label: row.label,
            perItemCdf: row.perItemCdf,
            keywordPattern: row.keywordPattern,
            sortOrder: row.sortOrder,
          },
        });
      }
      const { PricingTimeWindowService } = await import('../rides/pricing-time-window.service');
      for (const city of SEED_CITIES) {
        for (const w of PricingTimeWindowService.defaultSeedRows()) {
          const existing = await this.prisma.pricingTimeWindow.findFirst({
            where: { city, kind: w.kind, startHour: w.startHour, endHour: w.endHour },
          });
          if (!existing) {
            await this.prisma.pricingTimeWindow.create({
              data: { city, ...w },
            });
          }
        }
      }
    });

    await this.seedSection('moving-vehicle-categories', async () => {
      for (const row of MOVING_VEHICLE_CATEGORY_DEFAULTS) {
        await this.prisma.movingVehicleCategoryPricing.upsert({
          where: { category: row.category as MovingVehicleCategory },
          create: row,
          update: {},
        });
      }
    });

    await this.seedSection('parcel-weight-bands', async () => {
      for (const row of PARCEL_WEIGHT_BAND_DEFAULTS) {
        await this.prisma.parcelWeightBand.upsert({
          where: { category: row.category },
          create: row,
          update: {},
        });
      }
    });

    await this.seedSection('poi', async () => {
      const { ALL_POI_SEED } = await import('../geo/poi-seed.data');
      for (const row of ALL_POI_SEED) {
        const existing = await this.prisma.placeOfInterest.findFirst({
          where: {
            OR: [
              { osmId: row.osmId },
              { name: row.name, city: row.city, lat: row.lat, lng: row.lng },
            ],
          },
        });
        if (existing) continue;
        await this.prisma.placeOfInterest.create({
          data: {
            osmId: row.osmId,
            name: row.name,
            category: row.category,
            lat: row.lat,
            lng: row.lng,
            city: row.city,
            address: row.address,
            source: 'OSM',
          },
        });
      }
    });

    await this.seedSection('catalog', async () => {
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
      const demoVehicle = await this.prisma.rentalVehicle.findFirst({ where: { isActive: true } });
      const inquiryCount = await this.prisma.rentalInquiry.count();
      if (demoVehicle && inquiryCount === 0) {
        const start = new Date();
        start.setDate(start.getDate() + 1);
        const end = new Date(start);
        end.setDate(end.getDate() + 2);
        await this.prisma.rentalInquiry.create({
          data: {
            userId: 'demo-passenger-rental',
            vehicleId: demoVehicle.id,
            vehicleType: demoVehicle.category,
            startDate: start,
            endDate: end,
            pickupAddress: 'Gombe, Kinshasa',
            pickupCity: 'Kinshasa',
            contactPhone: '+243900000010',
            estimatedPriceCdf: demoVehicle.dailyRateCdf * 2,
            totalCdf: demoVehicle.dailyRateCdf * 2,
            status: 'PENDING',
          },
        });
      }
    });

    this.logger.log('Ride service seed data ensured');
  }
}
