import { PrismaClient, UserRole } from '@prisma/client';

/**
 * Local copy of `@mova/shared` isFakeUserSeedAllowed.
 * CI runs `npm ci --no-workspaces` then ts-node on this file; shared dist is not built.
 * Keep the production refuse: never seed +2439000000xx when NODE_ENV/APP_ENV=production.
 */
function isFakeUserSeedAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.RUN_SEED ?? '').trim().toLowerCase() === 'false') return false;
  const skip = (env.SKIP_DEMO_SEED ?? '').trim().toLowerCase();
  if (skip === 'true' || skip === '1' || skip === 'yes') return false;
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  const appEnv = (env.APP_ENV ?? '').trim().toLowerCase();
  if (nodeEnv === 'production' || appEnv === 'production') return false;
  return true;
}

/** Staff demo accounts for local RBAC testing (OTP 123456 with MOCK_OTP=true). */
export const STAFF_DEMO_ACCOUNTS = [
  { phone: '+243900000001', role: UserRole.SUPER_ADMIN, firstName: 'Super', lastName: 'Admin' },
  { phone: '+243900000002', role: UserRole.ADMIN, firstName: 'Admin', lastName: 'SENGA' },
  { phone: '+243900000003', role: UserRole.SUPPORT, firstName: 'Support', lastName: 'SENGA' },
  { phone: '+243900000004', role: UserRole.FINANCE, firstName: 'Finance', lastName: 'SENGA' },
  { phone: '+243900000005', role: UserRole.CONTENT, firstName: 'Content', lastName: 'SENGA' },
] as const;

async function main() {
  if (!isFakeUserSeedAllowed()) {
    console.log('Demo staff accounts skipped (production / RUN_SEED=false / SKIP_DEMO_SEED).');
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
