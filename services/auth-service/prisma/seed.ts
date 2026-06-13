import { PrismaClient, UserRole } from '@prisma/client';

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '+243900000001';

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: UserRole.ADMIN, firstName: 'Admin', lastName: 'MOVA' },
    update: { role: UserRole.ADMIN },
  });
  console.log(`Admin user ready: ${user.phone} (${user.role})`);
  console.log('Login: POST /api/auth/otp/request then verify with code 123456 (MOCK_OTP=true)');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
