import { IncidentType, KycStatus, PrismaClient, VehicleType } from '@prisma/client';

const DEMO_USER_IDS = {
  driver1: '22222222-2222-2222-2222-222222222201',
  driver2: '22222222-2222-2222-2222-222222222202',
  driver3: '22222222-2222-2222-2222-222222222203',
  driver4: '22222222-2222-2222-2222-222222222204',
  passenger1: '11111111-1111-1111-1111-111111111101',
  passenger2: '11111111-1111-1111-1111-111111111102',
};

const PENDING_DRIVERS = [
  { userId: DEMO_USER_IDS.driver1, license: 'KIN-DRV-001', plate: 'CD-1234-KIN', make: 'Toyota', model: 'Corolla', type: VehicleType.STANDARD },
  { userId: DEMO_USER_IDS.driver2, license: 'KIN-DRV-002', plate: 'CD-5678-KIN', make: 'Honda', model: 'CB125', type: VehicleType.MOTO_TAXI },
  { userId: DEMO_USER_IDS.driver3, license: 'KIN-DRV-003', plate: 'CD-9012-KIN', make: 'Mercedes', model: 'E-Class', type: VehicleType.COMFORT },
];

async function main() {
  const prisma = new PrismaClient();

  for (const d of PENDING_DRIVERS) {
    const profile = await prisma.driverProfile.upsert({
      where: { userId: d.userId },
      create: { userId: d.userId, licenseNumber: d.license, kycStatus: KycStatus.PENDING, currentLat: -4.32, currentLng: 15.31 },
      update: { licenseNumber: d.license, kycStatus: KycStatus.PENDING },
    });
    const existingVehicle = await prisma.vehicle.findFirst({ where: { driverProfileId: profile.id, plateNumber: d.plate } });
    if (!existingVehicle) {
      await prisma.vehicle.create({
        data: { driverProfileId: profile.id, type: d.type, make: d.make, model: d.model, plateNumber: d.plate, color: 'Noir' },
      });
    }
    const existingKyc = await prisma.kycDocument.findFirst({ where: { userId: d.userId, type: 'DRIVERS_LICENSE' } });
    if (!existingKyc) {
      await prisma.kycDocument.create({
        data: { userId: d.userId, type: 'DRIVERS_LICENSE', url: `https://cdn.mova.cd/kyc/${d.userId}/license.jpg`, status: KycStatus.PENDING },
      });
    }
  }

  const approvedProfile = await prisma.driverProfile.upsert({
    where: { userId: DEMO_USER_IDS.driver4 },
    create: { userId: DEMO_USER_IDS.driver4, licenseNumber: 'KIN-DRV-004', kycStatus: KycStatus.APPROVED, isAvailable: true, currentLat: -4.31, currentLng: 15.30, totalRides: 42 },
    update: { kycStatus: KycStatus.APPROVED, isAvailable: true },
  });
  const approvedVehicle = await prisma.vehicle.findFirst({ where: { driverProfileId: approvedProfile.id } });
  if (!approvedVehicle) {
    await prisma.vehicle.create({
      data: { driverProfileId: approvedProfile.id, type: VehicleType.STANDARD, make: 'Toyota', model: 'RAV4', plateNumber: 'CD-3456-KIN', color: 'Blanc' },
    });
  }

  const incidents = [
    { userId: DEMO_USER_IDS.passenger1, type: IncidentType.HARASSMENT, description: 'Comportement inapproprié du chauffeur pendant la course Gombe → Limete', status: 'OPEN' },
    { userId: DEMO_USER_IDS.passenger2, type: IncidentType.FRAUD, description: 'Paiement mobile money non crédité au portefeuille chauffeur', status: 'OPEN' },
    { userId: DEMO_USER_IDS.passenger1, type: IncidentType.OTHER, description: 'Retard de 45 min sur réservation planifiée — résolu avec remboursement', status: 'RESOLVED' },
  ];
  for (const inc of incidents) {
    const exists = await prisma.incident.findFirst({ where: { userId: inc.userId, description: inc.description } });
    if (!exists) await prisma.incident.create({ data: inc });
  }

  console.log(`Driver demo seeded: ${PENDING_DRIVERS.length} KYC pending, 1 approved driver, ${incidents.length} incidents`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
