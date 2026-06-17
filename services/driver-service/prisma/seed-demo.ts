import { IncidentType, KycStatus, PrismaClient, VehicleType } from '@prisma/client';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3011';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'mova-internal-dev';

const PENDING_DRIVERS = [
  {
    phone: '+243900000020',
    license: 'KIN-DRV-001',
    plate: 'CD-1234-KIN',
    make: 'Toyota',
    model: 'Corolla',
    type: VehicleType.STANDARD,
  },
  {
    phone: '+243900000021',
    license: 'KIN-DRV-002',
    plate: 'CD-5678-KIN',
    make: 'Honda',
    model: 'CB125',
    type: VehicleType.MOTO_TAXI,
  },
  {
    phone: '+243900000022',
    license: 'KIN-DRV-003',
    plate: 'CD-9012-KIN',
    make: 'Mercedes',
    model: 'E-Class',
    type: VehicleType.COMFORT,
  },
];

const APPROVED_DRIVER = {
  phone: '+243900000023',
  license: 'KIN-DRV-004',
  plate: 'CD-3456-KIN',
  make: 'Toyota',
  model: 'RAV4',
  type: VehicleType.STANDARD,
};

const DEMO_PASSENGERS = ['+243900000010', '+243900000011'];

async function userIdByPhone(phone: string): Promise<string | null> {
  const res = await fetch(`${AUTH_SERVICE_URL}/internal/users?take=200`, {
    headers: { 'x-internal-api-key': INTERNAL_API_KEY },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { id: string; phone: string }[] };
  return body.data?.find((u) => u.phone === phone)?.id ?? null;
}

async function upsertDriver(
  prisma: PrismaClient,
  userId: string,
  data: {
    license: string;
    plate: string;
    make: string;
    model: string;
    type: VehicleType;
    kycStatus: KycStatus;
    isAvailable?: boolean;
  },
) {
  const profile = await prisma.driverProfile.upsert({
    where: { userId },
    create: {
      userId,
      licenseNumber: data.license,
      kycStatus: data.kycStatus,
      isAvailable: data.isAvailable ?? false,
      currentLat: -4.32,
      currentLng: 15.31,
      operatingCity: 'Kinshasa',
    },
    update: {
      licenseNumber: data.license,
      ...(data.kycStatus === KycStatus.APPROVED ? { kycStatus: KycStatus.APPROVED } : {}),
      ...(data.isAvailable !== undefined ? { isAvailable: data.isAvailable } : {}),
    },
  });
  const existingVehicle = await prisma.vehicle.findFirst({
    where: { driverProfileId: profile.id, plateNumber: data.plate },
  });
  if (!existingVehicle) {
    await prisma.vehicle.create({
      data: {
        driverProfileId: profile.id,
        type: data.type,
        make: data.make,
        model: data.model,
        plateNumber: data.plate,
        color: 'Noir',
        isActive: true,
      },
    });
  }
  if (data.kycStatus === KycStatus.PENDING) {
    const existingKyc = await prisma.kycDocument.findFirst({
      where: { userId, type: 'DRIVERS_LICENSE' },
    });
    if (!existingKyc) {
      await prisma.kycDocument.create({
        data: {
          userId,
          type: 'DRIVERS_LICENSE',
          url: `https://cdn.mova.cd/kyc/${userId}/license.jpg`,
          status: KycStatus.PENDING,
        },
      });
    }
  }
  return profile;
}

async function ensureExtraVehicle(
  prisma: PrismaClient,
  userId: string,
  data: { plate: string; make: string; model: string; type: VehicleType },
) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile) return;
  const existing = await prisma.vehicle.findFirst({
    where: { driverProfileId: profile.id, type: data.type },
  });
  if (existing) return;
  await prisma.vehicle.create({
    data: {
      driverProfileId: profile.id,
      type: data.type,
      make: data.make,
      model: data.model,
      plateNumber: data.plate,
      color: 'Noir',
      isActive: true,
    },
  });
}

async function main() {
  const prisma = new PrismaClient();
  let synced = 0;

  for (const d of PENDING_DRIVERS) {
    const userId = await userIdByPhone(d.phone);
    if (!userId) {
      console.warn(`Skip driver seed — user not found: ${d.phone}`);
      continue;
    }
    await upsertDriver(prisma, userId, { ...d, kycStatus: KycStatus.PENDING });
    if (d.phone === '+243900000020') {
      await ensureExtraVehicle(prisma, userId, {
        plate: 'CD-MOTO-020',
        make: 'Honda',
        model: 'CB125',
        type: VehicleType.MOTO_TAXI,
      });
    }
    synced++;
  }

  const approvedUserId = await userIdByPhone(APPROVED_DRIVER.phone);
  if (approvedUserId) {
    await upsertDriver(prisma, approvedUserId, {
      ...APPROVED_DRIVER,
      kycStatus: KycStatus.APPROVED,
      isAvailable: true,
    });
    synced++;
  }

  for (const phone of DEMO_PASSENGERS) {
    const userId = await userIdByPhone(phone);
    if (!userId) continue;
    const incidents = [
      {
        type: IncidentType.HARASSMENT,
        description: 'Comportement inapproprié du chauffeur pendant la course Gombe → Limete',
        status: 'OPEN',
      },
      {
        type: IncidentType.FRAUD,
        description: 'Paiement mobile money non crédité au portefeuille chauffeur',
        status: 'OPEN',
      },
      {
        type: IncidentType.OTHER,
        description: 'Retard de 45 min sur réservation planifiée — résolu avec remboursement',
        status: 'RESOLVED',
      },
    ];
    for (const inc of incidents) {
      const exists = await prisma.incident.findFirst({
        where: { userId, description: inc.description },
      });
      if (!exists) {
        await prisma.incident.create({
          data: { userId, type: inc.type, description: inc.description, status: inc.status },
        });
      }
    }
  }

  console.log(`Driver demo seeded for ${synced} drivers (linked by phone via auth-service)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
