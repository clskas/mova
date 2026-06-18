import { DeliveryStatus, DeliveryType, PrismaClient, RideStatus, ScheduledRideStatus, VehicleType, WeightCategory } from '@prisma/client';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3011';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'mova-internal-dev';

const DEMO_PHONES = {
  passenger1: '+243900000010',
  passenger2: '+243900000011',
  passenger3: '+243900000012',
  driver1: '+243900000020',
};

async function userIdByPhone(phone: string): Promise<string | null> {
  const res = await fetch(`${AUTH_SERVICE_URL}/internal/users?take=200`, {
    headers: { 'x-internal-api-key': INTERNAL_API_KEY },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { id: string; phone: string }[] };
  return body.data?.find((u) => u.phone === phone)?.id ?? null;
}

async function main() {
  const prisma = new PrismaClient();
  const [passenger1, passenger2, passenger3, driver1] = await Promise.all([
    userIdByPhone(DEMO_PHONES.passenger1),
    userIdByPhone(DEMO_PHONES.passenger2),
    userIdByPhone(DEMO_PHONES.passenger3),
    userIdByPhone(DEMO_PHONES.driver1),
  ]);

  if (!driver1) {
    console.warn('Skip ride demo seed — driver +243900000020 not found in auth');
    await prisma.$disconnect();
    return;
  }

  const completedRides = [
    { passengerId: passenger1, driverId: driver1, pickupAddress: 'Gombe, Avenue Batetela', dropoffAddress: 'Limete, Marché Gambela', finalFareCdf: 8500 },
    { passengerId: passenger2, driverId: driver1, pickupAddress: 'Kalamu, Kasa-Vubu', dropoffAddress: 'Ngaliema, Socimat', finalFareCdf: 12000 },
    { passengerId: passenger3, driverId: driver1, pickupAddress: 'Lingwala, Isiro', dropoffAddress: 'Gombe, 30 Juin', finalFareCdf: 6500 },
  ];
  for (const r of completedRides) {
    if (!r.passengerId) continue;
    const exists = await prisma.ride.findFirst({ where: { passengerId: r.passengerId, pickupAddress: r.pickupAddress, status: RideStatus.COMPLETED } });
    if (!exists) {
      await prisma.ride.create({
        data: {
          ...r,
          passengerId: r.passengerId,
          driverId: r.driverId,
          status: RideStatus.COMPLETED,
          vehicleType: VehicleType.STANDARD,
          pickupLat: -4.31,
          pickupLng: 15.30,
          dropoffLat: -4.34,
          dropoffLng: 15.32,
          estimatedFareCdf: r.finalFareCdf,
          distanceKm: 4.2,
          durationMin: 18,
          completedAt: new Date(),
        },
      });
    } else if (exists.driverId !== driver1) {
      await prisma.ride.update({ where: { id: exists.id }, data: { driverId: driver1 } });
    }
  }

  const restaurant = await prisma.restaurant.findFirst({ where: { name: 'Chez Flore' } });

  const deliveries = [
    {
      userId: passenger1,
      type: DeliveryType.PARCEL,
      status: DeliveryStatus.IN_TRANSIT,
      pickupAddress: 'Gombe, Banque BIAC',
      dropoffAddress: 'Bandalungwa, UPN',
      weightCategory: WeightCategory.SMALL,
      estimatedPriceCdf: 5000,
    },
    {
      userId: passenger2,
      type: DeliveryType.FOOD,
      status: DeliveryStatus.PENDING,
      restaurantId: restaurant?.id,
      deliveryAddress: 'Kintambo, Victoire',
      estimatedPriceCdf: 18000,
      items: [{ name: 'Poulet moambe', qty: 2 }],
    },
  ];
  for (const d of deliveries) {
    if (!d.userId) continue;
    const key = d.type === DeliveryType.FOOD ? { userId: d.userId, type: d.type, restaurantId: d.restaurantId } : { userId: d.userId, pickupAddress: d.pickupAddress };
    const exists = await prisma.delivery.findFirst({ where: key });
    if (!exists) {
      await prisma.delivery.create({
        data: {
          userId: d.userId,
          type: d.type,
          status: d.status,
          pickupAddress: d.pickupAddress,
          dropoffAddress: d.dropoffAddress,
          pickupLat: d.pickupAddress ? -4.32 : undefined,
          pickupLng: d.pickupAddress ? 15.31 : undefined,
          dropoffLat: d.dropoffAddress ? -4.35 : undefined,
          dropoffLng: d.dropoffAddress ? 15.28 : undefined,
          weightCategory: d.weightCategory,
          restaurantId: d.restaurantId,
          deliveryAddress: d.deliveryAddress,
          deliveryLat: d.deliveryAddress ? -4.33 : undefined,
          deliveryLng: d.deliveryAddress ? 15.29 : undefined,
          items: d.items,
          estimatedPriceCdf: d.estimatedPriceCdf,
        },
      });
    }
  }

  const scheduledRides = [
    {
      passengerId: passenger1,
      pickupAddress: 'Gombe, Ambassade USA',
      dropoffAddress: 'Aéroport Ndjili',
      estimatedPriceCdf: 35000,
      distanceKm: 12,
      durationMin: 35,
    },
    {
      passengerId: passenger3,
      pickupAddress: 'Ngaliema, Fleuve Congo',
      dropoffAddress: 'Matete, Marché',
      estimatedPriceCdf: 15000,
      distanceKm: 8,
      durationMin: 22,
    },
  ];
  for (const s of scheduledRides) {
    if (!s.passengerId) continue;
    const exists = await prisma.scheduledRide.findFirst({ where: { passengerId: s.passengerId, pickupAddress: s.pickupAddress } });
    if (!exists) {
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 2);
      scheduledAt.setHours(8, 0, 0, 0);
      await prisma.scheduledRide.create({
        data: {
          ...s,
          passengerId: s.passengerId,
          status: ScheduledRideStatus.SCHEDULED,
          vehicleType: VehicleType.STANDARD,
          scheduledAt,
          pickupLat: -4.31,
          pickupLng: 15.30,
          dropoffLat: -4.38,
          dropoffLng: 15.33,
        },
      });
    }
  }

  console.log(`Ride demo seeded for driver ${driver1}: ${completedRides.length} rides target`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
