import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

/** Fixed IDs so driver/ride demo seeds can reference the same users across DBs. */
export const DEMO_USER_IDS = {
  passenger1: '11111111-1111-1111-1111-111111111101',
  passenger2: '11111111-1111-1111-1111-111111111102',
  passenger3: '11111111-1111-1111-1111-111111111103',
  driver1: '22222222-2222-2222-2222-222222222201',
  driver2: '22222222-2222-2222-2222-222222222202',
  driver3: '22222222-2222-2222-2222-222222222203',
  driver4: '22222222-2222-2222-2222-222222222204',
} as const;

const DEMO_PASSENGERS = [
  { suffix: 10, firstName: 'Marie', lastName: 'Kabila' },
  { suffix: 11, firstName: 'Paul', lastName: 'Mutombo' },
  { suffix: 12, firstName: 'Grace', lastName: 'Lumumba' },
  { suffix: 13, firstName: 'Joseph', lastName: 'Mbuyi' },
  { suffix: 14, firstName: 'Chantal', lastName: 'Ngoy' },
  { suffix: 15, firstName: 'David', lastName: 'Kasongo' },
  { suffix: 16, firstName: 'Esther', lastName: 'Mwamba' },
  { suffix: 17, firstName: 'Fabrice', lastName: 'Ilunga' },
  { suffix: 18, firstName: 'Hortense', lastName: 'Tshilombo' },
  { suffix: 19, firstName: 'Innocent', lastName: 'Bemba' },
] as const;

const DEMO_DRIVERS = [
  { suffix: 20, firstName: 'Jean', lastName: 'Mukendi' },
  { suffix: 21, firstName: 'Patrick', lastName: 'Kalala' },
  { suffix: 22, firstName: 'Emmanuel', lastName: 'Tshisekedi' },
  { suffix: 23, firstName: 'Alain', lastName: 'Kabeya' },
  { suffix: 24, firstName: 'Serge', lastName: 'Mpunga' },
  { suffix: 25, firstName: 'Olivier', lastName: 'Nzeba' },
  { suffix: 26, firstName: 'Rachel', lastName: 'Kazadi' },
  { suffix: 27, firstName: 'Michel', lastName: 'Banza' },
  { suffix: 28, firstName: 'Nadège', lastName: 'Mwadi' },
  { suffix: 29, firstName: 'Christian', lastName: 'Odia' },
] as const;

function demoUserId(role: 'passenger' | 'driver', suffix: number): string {
  const prefix = role === 'passenger' ? '11111111-1111-1111-1111-' : '22222222-2222-2222-2222-';
  return `${prefix}${String(suffix).padStart(12, '0')}`;
}

const DEMO_USERS = [
  ...DEMO_PASSENGERS.map((p) => ({
    id: demoUserId('passenger', p.suffix),
    phone: `+2439000000${p.suffix}`,
    firstName: p.firstName,
    lastName: p.lastName,
    role: UserRole.PASSENGER,
  })),
  ...DEMO_DRIVERS.map((d) => ({
    id: demoUserId('driver', d.suffix),
    phone: `+2439000000${d.suffix}`,
    firstName: d.firstName,
    lastName: d.lastName,
    role: UserRole.DRIVER,
  })),
];

async function main() {
  const prisma = new PrismaClient();
  for (const u of DEMO_USERS) {
    await prisma.user.upsert({
      where: { phone: u.phone },
      create: { ...u, status: UserStatus.ACTIVE },
      update: { firstName: u.firstName, lastName: u.lastName, role: u.role, status: UserStatus.ACTIVE },
    });
  }
  console.log(`Demo users seeded: ${DEMO_USERS.length} (${DEMO_PASSENGERS.length} passengers, ${DEMO_DRIVERS.length} drivers)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
