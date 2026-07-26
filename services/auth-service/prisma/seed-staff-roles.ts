import { PrismaClient, UserRole } from '@prisma/client';

/** Staff demo accounts for local RBAC testing (OTP 123456 with MOCK_OTP=true). */
export const STAFF_DEMO_ACCOUNTS = [
  { phone: '+243900000001', role: UserRole.SUPER_ADMIN, firstName: 'Super', lastName: 'Admin' },
  { phone: '+243900000002', role: UserRole.ADMIN, firstName: 'Admin', lastName: 'SENGA' },
  { phone: '+243900000003', role: UserRole.SUPPORT, firstName: 'Support', lastName: 'SENGA' },
  { phone: '+243900000004', role: UserRole.FINANCE, firstName: 'Finance', lastName: 'SENGA' },
  { phone: '+243900000005', role: UserRole.CONTENT, firstName: 'Content', lastName: 'SENGA' },
] as const;

async function main() {
  const prisma = new PrismaClient();
  for (const u of STAFF_DEMO_ACCOUNTS) {
    await prisma.user.upsert({
      where: { phone: u.phone },
      create: { phone: u.phone, role: u.role, firstName: u.firstName, lastName: u.lastName },
      update: { role: u.role, firstName: u.firstName, lastName: u.lastName },
    });
  }
  console.log(`Staff roles seeded: ${STAFF_DEMO_ACCOUNTS.length} accounts (+243900000001–005)`);
  console.log('Login: POST /api/auth/otp/request then verify with code 123456 (MOCK_OTP=true)');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
