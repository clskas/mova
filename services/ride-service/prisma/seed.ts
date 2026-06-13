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
    menuItems: [
      { name: 'Poulet moambe', unitPriceCdf: 12000 },
      { name: 'Liboke de poisson', unitPriceCdf: 15000 },
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
    menuItems: [
      { name: 'Pizza Margherita', unitPriceCdf: 18000 },
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
async function main() {
  for (const c of KINSHASA_COMMUNES) {
    await prisma.commune.upsert({ where: { name: c.name }, create: { name: c.name, lat: c.lat, lng: c.lng }, update: { lat: c.lat, lng: c.lng } });
  }
  for (const r of PRICING_RULES) {
    await prisma.pricingRule.upsert({ where: { vehicleType: r.vehicleType }, create: r, update: r });
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
  console.log('Ride service seed complete');
}
main().finally(() => prisma.$disconnect());
