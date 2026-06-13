import { DeliveryStatus, DeliveryType, PrismaClient, RideStatus, ScheduledRideStatus, VehicleType, WeightCategory } from '@prisma/client';

const DEMO_USER_IDS = {
  passenger1: '11111111-1111-1111-1111-111111111101',
  passenger2: '11111111-1111-1111-1111-111111111102',
  passenger3: '11111111-1111-1111-1111-111111111103',
  driver4: '22222222-2222-2222-2222-222222222204',
};

async function main() {
  const prisma = new PrismaClient();

  const completedRides = [
    { passengerId: DEMO_USER_IDS.passenger1, driverId: DEMO_USER_IDS.driver4, pickupAddress: 'Gombe, Avenue Batetela', dropoffAddress: 'Limete, Marché Gambela', finalFareCdf: 8500 },
    { passengerId: DEMO_USER_IDS.passenger2, driverId: DEMO_USER_IDS.driver4, pickupAddress: 'Kalamu, Kasa-Vubu', dropoffAddress: 'Ngaliema, Socimat', finalFareCdf: 12000 },
    { passengerId: DEMO_USER_IDS.passenger3, driverId: DEMO_USER_IDS.driver4, pickupAddress: 'Lingwala, Isiro', dropoffAddress: 'Gombe, 30 Juin', finalFareCdf: 6500 },
  ];
  for (const r of completedRides) {
    const exists = await prisma.ride.findFirst({ where: { passengerId: r.passengerId, pickupAddress: r.pickupAddress, status: RideStatus.COMPLETED } });
    if (!exists) {
      await prisma.ride.create({
        data: {
          ...r,
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
    }
  }

  const restaurant = await prisma.restaurant.findFirst({ where: { name: 'Chez Flore' } });

  const deliveries = [
    {
      userId: DEMO_USER_IDS.passenger1,
      type: DeliveryType.PARCEL,
      status: DeliveryStatus.IN_TRANSIT,
      pickupAddress: 'Gombe, Banque BIAC',
      dropoffAddress: 'Bandalungwa, UPN',
      weightCategory: WeightCategory.SMALL,
      estimatedPriceCdf: 5000,
    },
    {
      userId: DEMO_USER_IDS.passenger2,
      type: DeliveryType.FOOD,
      status: DeliveryStatus.PENDING,
      restaurantId: restaurant?.id,
      deliveryAddress: 'Kintambo, Victoire',
      estimatedPriceCdf: 18000,
      items: [{ name: 'Poulet moambe', qty: 2 }],
    },
  ];
  for (const d of deliveries) {
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

  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + 2);
  scheduledAt.setHours(8, 0, 0, 0);

  const scheduledRides = [
    {
      passengerId: DEMO_USER_IDS.passenger1,
      pickupAddress: 'Gombe, Ambassade USA',
      dropoffAddress: 'Aéroport Ndjili',
      scheduledAt,
      estimatedPriceCdf: 35000,
    },
    {
      passengerId: DEMO_USER_IDS.passenger3,
      pickupAddress: 'Ngaliema, Fleuve Congo',
      dropoffAddress: 'Matete, Marché',
      scheduledAt: new Date(scheduledAt.getTime() + 86400000),
      estimatedPriceCdf: 15000,
    },
  ];
  for (const s of scheduledRides) {
    const exists = await prisma.scheduledRide.findFirst({ where: { passengerId: s.passengerId, pickupAddress: s.pickupAddress } });
    if (!exists) {
      await prisma.scheduledRide.create({
        data: {
          ...s,
          status: ScheduledRideStatus.SCHEDULED,
          vehicleType: VehicleType.STANDARD,
          pickupLat: -4.31,
          pickupLng: 15.30,
          dropoffLat: -4.38,
          dropoffLng: 15.33,
          distanceKm: 12,
          durationMin: 35,
        },
      });
    }
  }

  console.log(`Ride demo seeded: ${completedRides.length} rides, ${deliveries.length} deliveries, ${scheduledRides.length} scheduled rides`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
