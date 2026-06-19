import { PrismaClient, UserRole } from '@prisma/client';

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '+243900000001';
const ADMIN_ROLE = (process.env.ADMIN_ROLE as UserRole) ?? UserRole.SUPER_ADMIN;
const RESTAURANT_PHONE = process.env.RESTAURANT_PHONE ?? '+243900000030';

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: ADMIN_ROLE, firstName: 'Admin', lastName: 'MOVA' },
    update: { role: ADMIN_ROLE },
  });
  const restaurantUser = await prisma.user.upsert({
    where: { phone: RESTAURANT_PHONE },
    create: {
      phone: RESTAURANT_PHONE,
      role: UserRole.RESTAURANT,
      firstName: 'Chez',
      lastName: 'Flore',
    },
    update: { role: UserRole.RESTAURANT },
  });
  console.log(`Admin user ready: ${user.phone} (${user.role})`);
  console.log(`Restaurant user ready: ${restaurantUser.phone} (${restaurantUser.id})`);
  console.log('Link restaurant ownerUserId in admin or ride DB to this user id.');
  console.log('Login: POST /api/auth/otp/request then verify with code 123456 (MOCK_OTP=true)');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
