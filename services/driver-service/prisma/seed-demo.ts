import { IncidentType, KycStatus, PrismaClient, VehicleType } from '@prisma/client';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3011';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'mova-internal-dev';

/** KYC APPROVED — prêts à accepter des courses après connexion. */
const APPROVED_DRIVER_PHONES = new Set([
  '+243900000023',
  '+243900000024',
  '+243900000025',
  '+243900000027',
  '+243900000029',
]);

const DRIVER_SEEDS = [
  { phone: '+243900000020', license: 'KIN-DRV-001', plate: 'CD-1234-KIN', make: 'Toyota', model: 'Corolla', type: VehicleType.STANDARD },
  { phone: '+243900000021', license: 'KIN-DRV-002', plate: 'CD-5678-KIN', make: 'Honda', model: 'CB125', type: VehicleType.MOTO_TAXI },
  { phone: '+243900000022', license: 'KIN-DRV-003', plate: 'CD-9012-KIN', make: 'Mercedes', model: 'E-Class', type: VehicleType.COMFORT },
  { phone: '+243900000023', license: 'KIN-DRV-004', plate: 'CD-3456-KIN', make: 'Toyota', model: 'Hiace', type: VehicleType.UTILITAIRE },
  { phone: '+243900000024', license: 'KIN-DRV-005', plate: 'CD-4567-KIN', make: 'Hyundai', model: 'Accent', type: VehicleType.STANDARD },
  { phone: '+243900000025', license: 'KIN-DRV-006', plate: 'CD-MOTO-025', make: 'Yamaha', model: 'FZ150', type: VehicleType.MOTO_TAXI },
  { phone: '+243900000026', license: 'KIN-DRV-007', plate: 'CD-6789-KIN', make: 'Toyota', model: 'Yaris', type: VehicleType.STANDARD },
  { phone: '+243900000027', license: 'KIN-DRV-008', plate: 'CD-COMF-027', make: 'BMW', model: 'Serie 3', type: VehicleType.COMFORT },
  { phone: '+243900000028', license: 'KIN-DRV-009', plate: 'CD-MOTO-028', make: 'Honda', model: 'Wave', type: VehicleType.MOTO_TAXI },
  { phone: '+243900000029', license: 'KIN-DRV-010', plate: 'CD-7890-KIN', make: 'Nissan', model: 'Sentra', type: VehicleType.STANDARD },
];

const DEMO_PASSENGERS = [
  '+243900000010',
  '+243900000011',
  '+243900000012',
  '+243900000013',
];

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
    onboardingCompleted?: boolean;
    activationPin?: string;
    activationPinVerified?: boolean;
  },
) {
  const now = new Date();
  const documentExpiry = new Date(now);
  documentExpiry.setUTCFullYear(documentExpiry.getUTCFullYear() + 2);
  const approved = data.kycStatus === KycStatus.APPROVED;
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
      onboardingCompleted: data.onboardingCompleted ?? false,
      charterAcceptedAt: data.onboardingCompleted ? now : null,
      trainingCompletedAt: data.onboardingCompleted ? now : null,
      payoutProvider: 'ORANGE_MONEY',
      activationPin: data.activationPin ?? null,
      activationPinVerifiedAt: data.activationPinVerified ? now : null,
      ...(approved
        ? {
            licenseExpiry: documentExpiry,
            insuranceExpiry: documentExpiry,
            technicalInspectionExpiry: documentExpiry,
          }
        : {}),
    },
    update: {
      licenseNumber: data.license,
      ...(data.kycStatus === KycStatus.APPROVED ? { kycStatus: KycStatus.APPROVED } : {}),
      ...(data.isAvailable !== undefined ? { isAvailable: data.isAvailable } : {}),
      ...(data.onboardingCompleted
        ? {
            onboardingCompleted: true,
            charterAcceptedAt: now,
            trainingCompletedAt: now,
          }
        : {}),
      ...(data.activationPin ? { activationPin: data.activationPin } : {}),
      ...(data.activationPinVerified ? { activationPinVerifiedAt: now } : {}),
      ...(approved
        ? {
            licenseExpiry: documentExpiry,
            insuranceExpiry: documentExpiry,
            technicalInspectionExpiry: documentExpiry,
            documentsRenewalPending: false,
          }
        : {}),
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
        ...(approved
          ? { typeApprovalStatus: KycStatus.APPROVED, typeApprovedAt: now }
          : {}),
      },
    });
  } else if (approved) {
    await prisma.vehicle.update({
      where: { id: existingVehicle.id },
      data: { typeApprovalStatus: KycStatus.APPROVED, typeApprovedAt: now, typeApprovalNotes: null },
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
  approved = false,
) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile) return;
  const existing = await prisma.vehicle.findFirst({
    where: { driverProfileId: profile.id, type: data.type },
  });
  if (existing) {
    if (approved && existing.typeApprovalStatus !== KycStatus.APPROVED) {
      await prisma.vehicle.update({
        where: { id: existing.id },
        data: { typeApprovalStatus: KycStatus.APPROVED, typeApprovedAt: new Date(), typeApprovalNotes: null },
      });
    }
    return;
  }
  await prisma.vehicle.create({
    data: {
      driverProfileId: profile.id,
      type: data.type,
      make: data.make,
      model: data.model,
      plateNumber: data.plate,
      color: 'Noir',
      isActive: true,
      ...(approved ? { typeApprovalStatus: KycStatus.APPROVED, typeApprovedAt: new Date() } : {}),
    },
  });
}

async function main() {
  const prisma = new PrismaClient();
  let synced = 0;

  for (const d of DRIVER_SEEDS) {
    const userId = await userIdByPhone(d.phone);
    if (!userId) {
      console.warn(`Skip driver seed — user not found: ${d.phone}`);
      continue;
    }
    const approved = APPROVED_DRIVER_PHONES.has(d.phone);
    await upsertDriver(prisma, userId, {
      license: d.license,
      plate: d.plate,
      make: d.make,
      model: d.model,
      type: d.type,
      kycStatus: approved ? KycStatus.APPROVED : KycStatus.PENDING,
      isAvailable: approved,
      onboardingCompleted: approved || d.phone === '+243900000020',
      activationPin: approved ? '123456' : undefined,
      activationPinVerified: approved,
    });
    if (d.phone === '+243900000023') {
      await ensureExtraVehicle(
        prisma,
        userId,
        {
          plate: 'CD-STD-023',
          make: 'Toyota',
          model: 'Corolla',
          type: VehicleType.STANDARD,
        },
        approved,
      );
    }
    if (d.phone === '+243900000020') {
      await ensureExtraVehicle(
        prisma,
        userId,
        {
          plate: 'CD-MOTO-020',
          make: 'Honda',
          model: 'CB125',
          type: VehicleType.MOTO_TAXI,
        },
        approved,
      );
      await ensureExtraVehicle(
        prisma,
        userId,
        {
          plate: 'CD-COMF-020',
          make: 'Toyota',
          model: 'Camry',
          type: VehicleType.COMFORT,
        },
        approved,
      );
    }
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

  console.log(`Driver demo seeded for ${synced} drivers (${APPROVED_DRIVER_PHONES.size} KYC approved)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
