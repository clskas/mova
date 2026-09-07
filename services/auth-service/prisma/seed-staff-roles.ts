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
  const skip = (process.env.SKIP_DEMO_SEED ?? '').trim().toLowerCase();
  if (skip === 'true' || skip === '1' || skip === 'yes' || process.env.NODE_ENV === 'production') {
    console.log('Demo staff accounts skipped (NODE_ENV=production or SKIP_DEMO_SEED).');
    const prisma = new PrismaClient();
    const owner = await prisma.user.upsert({
      where: { phone: '+243971163574' },
      create: {
        phone: '+243971163574',
        role: UserRole.SUPER_ADMIN,
        firstName: 'Super',
        lastName: 'Admin',
        email: 'celestinkas@gmail.com',
      },
      update: { role: UserRole.SUPER_ADMIN, email: 'celestinkas@gmail.com' },
    });
    console.log(`Owner superadmin ready: ${owner.phone} (${owner.role})`);
    await prisma.$disconnect();
    return;
  }

  const prisma = new PrismaClient();
  for (const u of STAFF_DEMO_ACCOUNTS) {
    await prisma.user.upsert({
      where: { phone: u.phone },
      create: { phone: u.phone, role: u.role, firstName: u.firstName, lastName: u.lastName },
      update: { role: u.role, firstName: u.firstName, lastName: u.lastName },
    });
  }
  const owner = await prisma.user.upsert({
    where: { phone: '+243971163574' },
    create: {
      phone: '+243971163574',
      role: UserRole.SUPER_ADMIN,
      firstName: 'Super',
      lastName: 'Admin',
      email: 'celestinkas@gmail.com',
    },
    update: { role: UserRole.SUPER_ADMIN, email: 'celestinkas@gmail.com' },
  });
  console.log(`Staff roles seeded: ${STAFF_DEMO_ACCOUNTS.length} demo accounts + owner ${owner.phone} (${owner.role})`);
  console.log('Login: POST /api/auth/otp/request then verify with code 123456 (MOCK_OTP=true)');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
