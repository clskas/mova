import { PrismaClient, UserRole } from '@prisma/client';

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '+243900000001';
const ADMIN_ROLE = (process.env.ADMIN_ROLE as UserRole) ?? UserRole.SUPER_ADMIN;

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: ADMIN_ROLE, firstName: 'Admin', lastName: 'MOVA' },
    update: { role: ADMIN_ROLE },
  });
  console.log(`Admin user ready: ${user.phone} (${user.role})`);
  console.log('Login: POST /api/auth/otp/request then verify with code 123456 (MOCK_OTP=true)');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
