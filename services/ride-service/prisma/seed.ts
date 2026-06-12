import { PrismaClient, VehicleType } from '@prisma/client';
import { KINSHASA_COMMUNES } from '@mova/shared';
const prisma = new PrismaClient();
const PRICING_RULES = [
  { vehicleType: VehicleType.MOTO_TAXI, baseFareCdf: 1500, perKmCdf: 800, perMinuteCdf: 100, minFareCdf: 2000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.STANDARD, baseFareCdf: 3000, perKmCdf: 1500, perMinuteCdf: 200, minFareCdf: 5000, peakMultiplier: 1.3, nightMultiplier: 1.2 },
  { vehicleType: VehicleType.COMFORT, baseFareCdf: 5000, perKmCdf: 2500, perMinuteCdf: 300, minFareCdf: 8000, peakMultiplier: 1.4, nightMultiplier: 1.3 },
];
const CANCELLATION_POLICIES = [
  { vehicleType: VehicleType.MOTO_TAXI, freeCancelMinutes: 2, passengerFeeCdf: 1000, driverCompensationCdf: 500, noShowFeeCdf: 2000 },
  { vehicleType: VehicleType.STANDARD, freeCancelMinutes: 3, passengerFeeCdf: 2000, driverCompensationCdf: 1000, noShowFeeCdf: 5000 },
  { vehicleType: VehicleType.COMFORT, freeCancelMinutes: 5, passengerFeeCdf: 3000, driverCompensationCdf: 1500, noShowFeeCdf: 8000 },
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
  console.log('Ride service seed complete');
}
main().finally(() => prisma.$disconnect());
