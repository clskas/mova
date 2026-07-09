import { PrismaClient, VehicleType } from '@prisma/client';
import { KINSHASA_COMMUNES } from '@mova/shared';
const prisma = new PrismaClient();

const KINSHASA_RESTAURANTS = [
  {
    name: 'Chez Flore',
    cuisine: 'Congolais',
    address: 'Avenue Batetela, Gombe, Kinshasa',
    lat: -4.3105,
    lng: 15.3032,
    rating: 4.6,
    imageUrl: 'https://cdn.mova.cd/restaurants/chez-flore.jpg',
    promotionLabel: '-10 % sur le poulet',
    menuItems: [
      {
        name: 'Poulet moambe',
        unitPriceCdf: 12000,
        description: 'Poulet mijoté à la sauce moambe',
        sizes: [{ label: 'Standard', priceCdf: 12000 }, { label: 'Grand', priceCdf: 15000 }],
        options: [{ label: 'Riz supplémentaire', priceCdf: 2000 }, { label: 'Piment', priceCdf: 0 }],
      },
      { name: 'Liboke de poisson', unitPriceCdf: 15000, options: [{ label: 'Banane plantain', priceCdf: 1500 }] },
      { name: 'Fufu et sauce', unitPriceCdf: 8000 },
    ],
  },
  {
    name: 'Limoncello',
    cuisine: 'Italien',
    address: 'Boulevard du 30 Juin, Gombe, Kinshasa',
    lat: -4.3189,
    lng: 15.3098,
    rating: 4.5,
    imageUrl: 'https://cdn.mova.cd/restaurants/limoncello.jpg',
    promotionLabel: 'Livraison offerte dès 25 000 FC',
    menuItems: [
      {
        name: 'Pizza Margherita',
        unitPriceCdf: 18000,
        sizes: [{ label: 'M', priceCdf: 18000 }, { label: 'L', priceCdf: 22000 }, { label: 'XL', priceCdf: 26000 }],
        options: [{ label: 'Extra fromage', priceCdf: 2500 }, { label: 'Olives', priceCdf: 1500 }],
      },
      { name: 'Pasta carbonara', unitPriceCdf: 16000 },
      { name: 'Tiramisu', unitPriceCdf: 7000 },
    ],
  },
  {
    name: 'Planet Hollybum',
    cuisine: 'Fast-food',
    address: 'Avenue de la Justice, Gombe, Kinshasa',
    lat: -4.3251,
    lng: 15.3124,
    rating: 4.2,
    imageUrl: 'https://cdn.mova.cd/restaurants/planet-hollybum.jpg',
    menuItems: [
      { name: 'Burger classique', unitPriceCdf: 10000 },
      { name: 'Frites', unitPriceCdf: 4000 },
      { name: 'Milkshake', unitPriceCdf: 6000 },
    ],
  },
  {
    name: 'Café Conc',
    cuisine: 'Café & brunch',
    address: 'Avenue Isiro, Lingwala, Kinshasa',
    lat: -4.3287,
    lng: 15.2985,
    rating: 4.4,
    imageUrl: 'https://cdn.mova.cd/restaurants/cafe-conc.jpg',
    menuItems: [
      { name: 'Croissant', unitPriceCdf: 3500 },
      { name: 'Omelette', unitPriceCdf: 9000 },
      { name: 'Cappuccino', unitPriceCdf: 5000 },
    ],
  },
  {
    name: 'Mama Yemo Grill',
    cuisine: 'Grillades',
    address: 'Avenue Kasa-Vubu, Kalamu, Kinshasa',
    lat: -4.3412,
    lng: 15.3198,
    rating: 4.3,
    imageUrl: 'https://cdn.mova.cd/restaurants/mama-yemo-grill.jpg',
    menuItems: [
      { name: 'Brochettes de bœuf', unitPriceCdf: 11000 },
      { name: 'Poulet grillé', unitPriceCdf: 13000 },
      { name: 'Chikwangue', unitPriceCdf: 3000 },
    ],
  },
];
const PRICING_RULES = [
  { vehicleType: VehicleType.MOTO_TAXI, baseFareCdf: 1500, perKmCdf: 800, perMinuteCdf: 100, minFareCdf: 2000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.STANDARD, baseFareCdf: 3000, perKmCdf: 1500, perMinuteCdf: 200, minFareCdf: 5000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.COMFORT, baseFareCdf: 5000, perKmCdf: 2500, perMinuteCdf: 300, minFareCdf: 8000, peakMultiplier: 1.4, nightMultiplier: 1.3 },
  { vehicleType: VehicleType.VIP, baseFareCdf: 8000, perKmCdf: 3500, perMinuteCdf: 400, minFareCdf: 12000, peakMultiplier: 1.5, nightMultiplier: 1.4 },
];
const CANCELLATION_POLICIES = [
  { vehicleType: VehicleType.MOTO_TAXI, freeCancelMinutes: 2, passengerFeeCdf: 1000, driverCompensationCdf: 500, noShowFeeCdf: 2000 },
  { vehicleType: VehicleType.STANDARD, freeCancelMinutes: 3, passengerFeeCdf: 2000, driverCompensationCdf: 1000, noShowFeeCdf: 5000 },
  { vehicleType: VehicleType.COMFORT, freeCancelMinutes: 5, passengerFeeCdf: 3000, driverCompensationCdf: 1500, noShowFeeCdf: 8000 },
  { vehicleType: VehicleType.VIP, freeCancelMinutes: 5, passengerFeeCdf: 5000, driverCompensationCdf: 2500, noShowFeeCdf: 10000 },
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
    features: ['Climatisation', 'Bluetooth'],
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
    features: ['Climatisation', 'GPS', '4x4'],
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
    features: ['Climatisation', 'GPS', 'Cuir', 'Toit ouvrant'],
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
    features: ['Climatisation', 'GPS'],
    mileageUnlimited: true,
    limitedMileageFeeCdf: 30000,
  },
];
async function main() {
  for (const c of KINSHASA_COMMUNES) {
    await prisma.commune.upsert({
      where: { name_city: { name: c.name, city: 'Kinshasa' } },
      create: { name: c.name, city: 'Kinshasa', lat: c.lat, lng: c.lng },
      update: { lat: c.lat, lng: c.lng },
    });
  }
  for (const r of PRICING_RULES) {
    await prisma.pricingRule.upsert({
      where: { vehicleType_city: { vehicleType: r.vehicleType, city: 'Kinshasa' } },
      create: { ...r, city: 'Kinshasa' },
      update: r,
    });
  }
  for (const p of CANCELLATION_POLICIES) {
    await prisma.cancellationPolicy.upsert({ where: { vehicleType: p.vehicleType }, create: p, update: p });
  }
  for (const r of KINSHASA_RESTAURANTS) {
    const existing = await prisma.restaurant.findFirst({ where: { name: r.name } });
    if (existing) {
      await prisma.restaurant.update({ where: { id: existing.id }, data: r });
    } else {
      await prisma.restaurant.create({ data: r });
    }
  }
  for (const v of RENTAL_VEHICLES) {
    const existing = await prisma.rentalVehicle.findFirst({ where: { name: v.name } });
    if (existing) await prisma.rentalVehicle.update({ where: { id: existing.id }, data: v });
    else await prisma.rentalVehicle.create({ data: v });
  }

  const chezFlore = await prisma.restaurant.findFirst({ where: { name: 'Chez Flore' } });
  if (chezFlore) {
    await prisma.promoCode.upsert({
      where: { code: 'CHEZ-FLORE10' },
      create: {
        code: 'CHEZ-FLORE10',
        discountPercent: 10,
        maxUses: 500,
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        ownerType: 'RESTAURANT',
        scope: 'FOOD_MENU_ONLY',
        absorbedBy: 'PARTNER',
        restaurantId: chezFlore.id,
      },
      update: {
        discountPercent: 10,
        isActive: true,
        ownerType: 'RESTAURANT',
        scope: 'FOOD_MENU_ONLY',
        absorbedBy: 'PARTNER',
        restaurantId: chezFlore.id,
      },
    });
  }

  console.log('Ride service seed complete');
}
main().finally(() => prisma.$disconnect());
