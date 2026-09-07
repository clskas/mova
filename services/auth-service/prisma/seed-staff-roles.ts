import { PrismaClient, UserRole } from '@prisma/client';

/**
 * Local copy of `@mova/shared` isFakeUserSeedAllowed / bootstrap helpers.
 * CI runs `npm ci --no-workspaces` then ts-node on this file; shared dist is not built.
 * FORBIDDEN: never seed +2439000000xx when NODE_ENV/APP_ENV=production OR Render.
 * Playwright CI: PLAYWRIGHT=1 or APP_ENV=test (see docker-compose.ci.yml).
 * Local only: APP_ENV=development AND RUN_SEED=true.
 */

function envFlagTrue(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = (env[key] ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function isProductionOrRenderEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  const appEnv = (env.APP_ENV ?? '').trim().toLowerCase();
  if (nodeEnv === 'production' || appEnv === 'production' || appEnv === 'staging') return true;
  const render = (env.RENDER ?? '').trim().toLowerCase();
  if (render === 'true' || render === '1' || render === 'yes') return true;
  if ((env.RENDER_SERVICE_ID ?? '').trim()) return true;
  if ((env.RENDER_INSTANCE_ID ?? '').trim()) return true;
  if ((env.RENDER_SERVICE_NAME ?? '').trim()) return true;
  if ((env.RENDER_EXTERNAL_URL ?? '').trim()) return true;
  return false;
}

function isFakeUserSeedAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.RUN_SEED ?? '').trim().toLowerCase() === 'false') return false;
  if (envFlagTrue(env, 'SKIP_DEMO_SEED')) return false;
  if (isProductionOrRenderEnv(env)) return false;
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  const appEnv = (env.APP_ENV ?? '').trim().toLowerCase();
  if (envFlagTrue(env, 'PLAYWRIGHT') || appEnv === 'test' || nodeEnv === 'test') return true;
  if ((env.RUN_SEED ?? '').trim().toLowerCase() !== 'true') return false;
  return appEnv === 'development' || nodeEnv === 'development';
}

const SEED_DEMO_PHONE_RE = /^\+2439000000\d{2}$/;

function resolveBootstrapSuperadminPhone(env: NodeJS.ProcessEnv = process.env): string | null {
  const phone = (env.BOOTSTRAP_SUPERADMIN_PHONE ?? '').trim();
  if (!phone) return null;
  if (SEED_DEMO_PHONE_RE.test(phone)) {
    console.error(
      'FORBIDDEN: BOOTSTRAP_SUPERADMIN_PHONE must not be a demo +2439000000xx number (no admin123 / fake staff).',
    );
    return null;
  }
  return phone;
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
  const prisma = new PrismaClient();
  try {
    const bootstrapPhone = resolveBootstrapSuperadminPhone();
    if (bootstrapPhone) {
      const firstName = process.env.BOOTSTRAP_SUPERADMIN_FIRST_NAME?.trim() || 'Super';
      const lastName = process.env.BOOTSTRAP_SUPERADMIN_LAST_NAME?.trim() || 'Admin';
      const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim() || undefined;
      const owner = await prisma.user.upsert({
        where: { phone: bootstrapPhone },
        create: {
          phone: bootstrapPhone,
          role: UserRole.SUPER_ADMIN,
          firstName,
          lastName,
          ...(email ? { email } : {}),
        },
        update: { role: UserRole.SUPER_ADMIN, ...(email ? { email } : {}) },
      });
      console.log(`Bootstrap superadmin ready: ${owner.phone} (${owner.role})`);
    }

    if (!isFakeUserSeedAllowed()) {
      const wantsCiSeed =
        envFlagTrue(process.env, 'PLAYWRIGHT') ||
        (process.env.APP_ENV ?? '').trim().toLowerCase() === 'test' ||
        (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'test';
      if (wantsCiSeed) {
        console.error(
          'FATAL: Playwright/CI asked for staff seed but isFakeUserSeedAllowed is false (NODE_ENV/APP_ENV=production or Render). Use docker-compose.ci.yml with APP_ENV=test NODE_ENV=test PLAYWRIGHT=1 — never the Render start command.',
        );
        process.exit(1);
      }
      console.error(
        'FORBIDDEN: production/Render seed of fake staff phones (+2439000000xx) is skipped. Local: APP_ENV=development AND RUN_SEED=true. CI: APP_ENV=test PLAYWRIGHT=1.',
      );
      return;
    }

    for (const u of STAFF_DEMO_ACCOUNTS) {
      await prisma.user.upsert({
        where: { phone: u.phone },
        create: { phone: u.phone, role: u.role, firstName: u.firstName, lastName: u.lastName },
        update: { role: u.role, firstName: u.firstName, lastName: u.lastName },
      });
    }
    console.log(`Staff roles seeded: ${STAFF_DEMO_ACCOUNTS.length} demo accounts`);
    console.log('Login: POST /api/auth/otp/request then verify with code 123456 (MOCK_OTP=true)');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
