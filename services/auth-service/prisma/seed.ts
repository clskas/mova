/**
 * Auth seed.
 * FORBIDDEN in production / Render: never create fake phones (+2439000000xx, admin123, Chez Flore, Marie Kabila, Jean Mukendi).
 * Local: APP_ENV=development RUN_SEED=true npm run prisma:seed
 * Production superadmin: BOOTSTRAP_SUPERADMIN_PHONE only — do not recreate demo admin123.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import { isFakeUserSeedAllowed, resolveBootstrapSuperadminPhone } from '@mova/shared';

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '+243900000001';
const ADMIN_ROLE = (process.env.ADMIN_ROLE as UserRole) ?? UserRole.SUPER_ADMIN;
const RESTAURANT_PHONE = process.env.RESTAURANT_PHONE ?? '+243900000030';
const RENTAL_PARTNER_PHONE = process.env.RENTAL_PARTNER_PHONE ?? '+243900000031';

async function bootstrapSuperadmin(prisma: PrismaClient): Promise<void> {
  const phone = resolveBootstrapSuperadminPhone();
  if (!phone) return;
  const firstName = process.env.BOOTSTRAP_SUPERADMIN_FIRST_NAME?.trim() || 'Super';
  const lastName = process.env.BOOTSTRAP_SUPERADMIN_LAST_NAME?.trim() || 'Admin';
  const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim() || undefined;
  const owner = await prisma.user.upsert({
    where: { phone },
    create: {
      phone,
      role: UserRole.SUPER_ADMIN,
      firstName,
      lastName,
      ...(email ? { email } : {}),
    },
    update: { role: UserRole.SUPER_ADMIN, ...(email ? { email } : {}) },
  });
  console.log(`Bootstrap superadmin ready: ${owner.phone} (${owner.role})`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await bootstrapSuperadmin(prisma);

    if (!isFakeUserSeedAllowed()) {
      console.error(
        'FORBIDDEN: production/Render seed of fake phones (+2439000000xx) is skipped. Local only: APP_ENV=development AND RUN_SEED=true.',
      );
      return;
    }

    const user = await prisma.user.upsert({
      where: { phone: ADMIN_PHONE },
      create: { phone: ADMIN_PHONE, role: ADMIN_ROLE, firstName: 'Admin', lastName: 'SENGA' },
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
    const rentalPartner = await prisma.user.upsert({
      where: { phone: RENTAL_PARTNER_PHONE },
      create: {
        phone: RENTAL_PARTNER_PHONE,
        role: UserRole.RENTAL_PARTNER,
        firstName: 'Partenaire',
        lastName: 'Location',
      },
      update: { role: UserRole.RENTAL_PARTNER },
    });
    console.log(`Admin user ready: ${user.phone} (${user.role})`);
    console.log(`Restaurant user ready: ${restaurantUser.phone} (${restaurantUser.id})`);
    console.log(`Rental partner ready: ${rentalPartner.phone} (${rentalPartner.id})`);
    console.log('Link restaurant ownerUserId in admin or ride DB to this user id.');
    console.log('Login: POST /api/auth/otp/request then verify with code 123456 (MOCK_OTP=true)');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
