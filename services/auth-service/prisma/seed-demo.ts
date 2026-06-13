import { PrismaClient, UserRole } from '@prisma/client';

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

const DEMO_USERS = [
  { id: DEMO_USER_IDS.passenger1, phone: '+243900000010', firstName: 'Marie', lastName: 'Kabila', role: UserRole.PASSENGER },
  { id: DEMO_USER_IDS.passenger2, phone: '+243900000011', firstName: 'Paul', lastName: 'Mutombo', role: UserRole.PASSENGER },
  { id: DEMO_USER_IDS.passenger3, phone: '+243900000012', firstName: 'Grace', lastName: 'Lumumba', role: UserRole.PASSENGER },
  { id: DEMO_USER_IDS.driver1, phone: '+243900000020', firstName: 'Jean', lastName: 'Mukendi', role: UserRole.DRIVER },
  { id: DEMO_USER_IDS.driver2, phone: '+243900000021', firstName: 'Patrick', lastName: 'Kalala', role: UserRole.DRIVER },
  { id: DEMO_USER_IDS.driver3, phone: '+243900000022', firstName: 'Emmanuel', lastName: 'Tshisekedi', role: UserRole.DRIVER },
  { id: DEMO_USER_IDS.driver4, phone: '+243900000023', firstName: 'Alain', lastName: 'Kabeya', role: UserRole.DRIVER },
];

async function main() {
  const prisma = new PrismaClient();
  for (const u of DEMO_USERS) {
    await prisma.user.upsert({
      where: { phone: u.phone },
      create: u,
      update: { firstName: u.firstName, lastName: u.lastName, role: u.role },
    });
  }
  console.log(`Demo users seeded: ${DEMO_USERS.length} (3 passengers, 4 drivers)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
