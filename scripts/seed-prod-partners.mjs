/**
 * Restore demo partner accounts on production (or any) auth + rides DBs.
 *
 * Usage:
 *   $env:AUTH_DATABASE_URL="postgresql://..."
 *   $env:RIDE_DATABASE_URL="postgresql://..."
 *   node scripts/seed-prod-partners.mjs
 *
 * Or with Render API (fetches external connection strings):
 *   $env:RENDER_API_KEY="rnd_..."
 *   node scripts/seed-prod-partners.mjs
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESTAURANT_PHONE = '+243900000030';
const RENTAL_PHONE = '+243900000031';

function runNodeInService(serviceRel, databaseUrl, code) {
  const cwd = path.join(root, serviceRel);
  return execFileSync(process.execPath, ['-e', code], {
    cwd,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function renderJson(apiPath) {
  const key = process.env.RENDER_API_KEY;
  if (!key) throw new Error('RENDER_API_KEY is required to discover database URLs');
  const res = await fetch(`https://api.render.com/v1${apiPath}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Render API ${apiPath} HTTP ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

function unwrapPostgresList(payload) {
  if (Array.isArray(payload)) {
    return payload.map((row) => row.postgres ?? row);
  }
  if (Array.isArray(payload?.data)) {
    return payload.data.map((row) => row.postgres ?? row);
  }
  return [];
}

async function connectionStringForPostgres(id) {
  const info = await renderJson(`/postgres/${id}/connection-info`);
  const url =
    info?.externalConnectionString ??
    info?.externalConnectionStringPgbouncer ??
    info?.connectionString;
  if (!url) throw new Error(`No external connection string for postgres ${id}`);
  return url;
}

async function resolveDatabaseUrls() {
  if (process.env.AUTH_DATABASE_URL && process.env.RIDE_DATABASE_URL) {
    return {
      auth: process.env.AUTH_DATABASE_URL,
      rides: process.env.RIDE_DATABASE_URL,
    };
  }
  const list = unwrapPostgresList(await renderJson('/postgres?limit=50'));
  const authDb = list.find((db) => db.name === 'mova-db-auth' || db.databaseName === 'mova_auth');
  const ridesDb = list.find((db) => db.name === 'mova-db-rides' || db.databaseName === 'mova_rides');
  if (!authDb?.id || !ridesDb?.id) {
    throw new Error(
      `Could not find mova-db-auth / mova-db-rides in Render postgres list (${list.map((d) => d.name).join(', ') || 'empty'})`,
    );
  }
  return {
    auth: await connectionStringForPostgres(authDb.id),
    rides: await connectionStringForPostgres(ridesDb.id),
  };
}

async function main() {
  const urls = await resolveDatabaseUrls();
  console.log('Seeding partner users on auth DB...');
  const authOut = runNodeInService(
    'services/auth-service',
    urls.auth,
    `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      (async () => {
        const admin = await prisma.user.upsert({
          where: { phone: '+243900000001' },
          create: { phone: '+243900000001', role: 'SUPER_ADMIN', status: 'ACTIVE', firstName: 'Admin', lastName: 'SENGA' },
          update: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
        });
        const restaurant = await prisma.user.upsert({
          where: { phone: '${RESTAURANT_PHONE}' },
          create: { phone: '${RESTAURANT_PHONE}', role: 'RESTAURANT', status: 'ACTIVE', firstName: 'Chez', lastName: 'Flore' },
          update: { role: 'RESTAURANT', status: 'ACTIVE' },
        });
        const rental = await prisma.user.upsert({
          where: { phone: '${RENTAL_PHONE}' },
          create: { phone: '${RENTAL_PHONE}', role: 'RENTAL_PARTNER', status: 'ACTIVE', firstName: 'Partenaire', lastName: 'Location' },
          update: { role: 'RENTAL_PARTNER', status: 'ACTIVE' },
        });
        console.log(JSON.stringify({ adminId: admin.id, adminRole: admin.role, restaurantId: restaurant.id, rentalId: rental.id, restaurantRole: restaurant.role, rentalRole: rental.role }));
        await prisma.$disconnect();
      })().catch((e) => { console.error(e); process.exit(1); });
    `,
  );
  const idsLine = authOut.trim().split(/\r?\n/).filter(Boolean).pop();
  const ids = JSON.parse(idsLine);
  console.log(`Auth users: restaurant ${ids.restaurantId} (${ids.restaurantRole}), rental ${ids.rentalId} (${ids.rentalRole})`);

  console.log('Linking restaurant + rental vehicle on rides DB...');
  runNodeInService(
    'services/ride-service',
    urls.rides,
    `
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const restaurantOwnerId = ${JSON.stringify(ids.restaurantId)};
      const rentalOwnerId = ${JSON.stringify(ids.rentalId)};
      (async () => {
        let restaurant = await prisma.restaurant.findFirst({ where: { name: 'Chez Flore' } });
        if (restaurant) {
          restaurant = await prisma.restaurant.update({
            where: { id: restaurant.id },
            data: { ownerUserId: restaurantOwnerId, isActive: true, isAcceptingOrders: true },
          });
        } else {
          restaurant = await prisma.restaurant.create({
            data: {
              name: 'Chez Flore',
              cuisine: 'Congolais',
              address: 'Avenue Batetela, Gombe, Kinshasa',
              lat: -4.3105,
              lng: 15.3032,
              rating: 4.6,
              ownerUserId: restaurantOwnerId,
              isActive: true,
              isAcceptingOrders: true,
              menuItems: [
                { name: 'Poulet moambe', unitPriceCdf: 12000, description: 'Poulet mijoté à la sauce moambe' },
                { name: 'Liboke de poisson', unitPriceCdf: 15000 },
                { name: 'Fufu et sauce', unitPriceCdf: 8000 },
              ],
            },
          });
        }
        let vehicle = await prisma.rentalVehicle.findFirst({ where: { name: 'Toyota Corolla' } });
        if (vehicle) {
          vehicle = await prisma.rentalVehicle.update({
            where: { id: vehicle.id },
            data: { ownerUserId: rentalOwnerId, isActive: true, approvalStatus: 'APPROVED' },
          });
        } else {
          vehicle = await prisma.rentalVehicle.create({
            data: {
              name: 'Toyota Corolla',
              make: 'Toyota',
              model: 'Corolla',
              year: 2021,
              category: 'ECONOMY',
              transmission: 'MANUAL',
              city: 'Kinshasa',
              seats: 5,
              dailyRateCdf: 45000,
              depositCdf: 100000,
              ownerName: 'Partenaire Location',
              ownerContactPhone: '${RENTAL_PHONE}',
              ownerUserId: rentalOwnerId,
              isActive: true,
              approvalStatus: 'APPROVED',
              features: ['Climatisation', 'Bluetooth'],
            },
          });
        }
        console.log(JSON.stringify({ restaurantId: restaurant.id, vehicleId: vehicle.id }));
        await prisma.$disconnect();
      })().catch((e) => { console.error(e); process.exit(1); });
    `,
  );
  console.log('Partner accounts ready:');
  console.log(`  SENGA Restaurant  ${RESTAURANT_PHONE}  OTP 123456  (ALLOW_TEST_OTP)`);
  console.log(`  SENGA Location    ${RENTAL_PHONE}  OTP 123456  (ALLOW_TEST_OTP)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
