/**
 * List (default) then optionally delete Play Test Lab / seed-demo accounts.
 * Never prints connection strings or secrets.
 *
 *   node scripts/cleanup-store-testers.mjs
 *   $env:CONFIRM_DELETE_STORE_TESTERS="YES"; node scripts/cleanup-store-testers.mjs
 *
 * Needs RENDER_API_KEY, or AUTH_DATABASE_URL / DATABASE_URL_AUTH. Uses local psql.
 */
import { execFileSync } from 'node:child_process';

const APPLY = process.env.CONFIRM_DELETE_STORE_TESTERS === 'YES';
const PSQL = process.env.PSQL_BIN || 'psql';

const LIST_SQL = `
SELECT id, COALESCE(phone, '-') AS phone,
       COALESCE("firstName", '') AS first,
       COALESCE("lastName", '') AS last,
       COALESCE(email, '-') AS email,
       role, status,
       to_char("createdAt", 'YYYY-MM-DD') AS created
FROM users
WHERE
  COALESCE(email, '') ILIKE '%@cloudtestlabaccounts.com'
  OR (
    (phone IS NULL OR BTRIM(phone) = '')
    AND COALESCE(email, '') ~* '^[a-z0-9]+([._][a-z0-9]+)*\\.[0-9]{5}@gmail\\.com$'
  )
  OR COALESCE(phone, '') ~ '^\\+2439000000[0-9]{2}$'
ORDER BY "createdAt" DESC;
`;

const DELETE_OTP_SQL = `
DELETE FROM otp_codes
WHERE phone IN (
  SELECT phone FROM users
  WHERE phone IS NOT NULL AND (
    COALESCE(email, '') ILIKE '%@cloudtestlabaccounts.com'
    OR COALESCE(phone, '') ~ '^\\+2439000000[0-9]{2}$'
  )
);
`;

const DELETE_USERS_SQL = `
DELETE FROM users
WHERE
  COALESCE(email, '') ILIKE '%@cloudtestlabaccounts.com'
  OR (
    (phone IS NULL OR BTRIM(phone) = '')
    AND COALESCE(email, '') ~* '^[a-z0-9]+([._][a-z0-9]+)*\\.[0-9]{5}@gmail\\.com$'
    AND role IN ('PASSENGER', 'DRIVER')
  )
  OR COALESCE(phone, '') ~ '^\\+2439000000[0-9]{2}$';
`;

async function renderJson(apiPath) {
  const key = process.env.RENDER_API_KEY;
  if (!key) throw new Error('RENDER_API_KEY is required to discover database URLs');
  const res = await fetch(`https://api.render.com/v1${apiPath}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Render API ${apiPath} HTTP ${res.status}`);
  return text ? JSON.parse(text) : null;
}

function unwrapPostgresList(payload) {
  if (Array.isArray(payload)) return payload.map((row) => row.postgres ?? row);
  if (Array.isArray(payload?.data)) return payload.data.map((row) => row.postgres ?? row);
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

function findPostgres(list, names, dbName) {
  return list.find((db) => names.includes(db.name) || db.databaseName === dbName);
}

function withDatabase(url, databaseName) {
  const u = new URL(url);
  u.pathname = `/${databaseName}`;
  return u.toString();
}

async function resolveUrls() {
  const urls = {
    auth: process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL_AUTH || '',
    drivers: process.env.DRIVER_DATABASE_URL || process.env.DATABASE_URL_DRIVERS || '',
    payments: process.env.PAYMENT_DATABASE_URL || process.env.DATABASE_URL_PAYMENTS || '',
  };
  if (!urls.auth) {
    const list = unwrapPostgresList(await renderJson('/postgres?limit=50'));
    const authDb = findPostgres(list, ['mova-db-auth'], 'mova_auth');
    const driverDb = findPostgres(list, ['mova-db-drivers', 'mova-db-driver'], 'mova_drivers');
    if (!authDb?.id) {
      throw new Error(
        `Could not find mova-db-auth (Render: ${list.map((d) => d.name).join(', ') || 'empty'})`,
      );
    }
    urls.auth = await connectionStringForPostgres(authDb.id);
    if (driverDb?.id) urls.drivers = await connectionStringForPostgres(driverDb.id);
  }
  if (urls.auth && !urls.drivers) urls.drivers = withDatabase(urls.auth, 'mova_drivers');
  if (urls.auth && !urls.payments) urls.payments = withDatabase(urls.auth, 'mova_payments');
  return urls;
}

function psql(databaseUrl, sql, extraArgs = []) {
  return execFileSync(
    PSQL,
    ['--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off', ...extraArgs, databaseUrl, '-c', sql],
    {
      env: { ...process.env, PGSSLMODE: process.env.PGSSLMODE || 'require' },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
}

async function main() {
  const urls = await resolveUrls();
  const listed = psql(urls.auth, LIST_SQL, ['-A', '-F', '|']);
  const lines = listed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('id|') && !/^\\d+ rows?/.test(l) && l !== '(0 rows)');
  const dataLines = lines.filter((l) => l.includes('|') && !/^\(\d+ rows?\)$/.test(l));
  console.log(APPLY ? 'APPLY=yes (will delete listed rows)' : 'LIST only (no delete)');
  console.log(`Matching users: ${dataLines.length}`);
  for (const line of dataLines) console.log(line);
  if (!APPLY) {
    console.log('Re-run with CONFIRM_DELETE_STORE_TESTERS=YES to delete these rows.');
    return;
  }
  if (!dataLines.length) {
    console.log('Nothing to delete.');
    return;
  }
  const unexpectedStaff = dataLines.filter((line) => {
    const parts = line.split('|');
    const phone = parts[1] || '';
    const role = parts[5] || '';
    const isDemoPhone = /^\+2439000000\d{2}$/.test(phone);
    const isStaff = !['PASSENGER', 'DRIVER'].includes(role);
    return isStaff && !isDemoPhone;
  });
  if (unexpectedStaff.length) {
    console.error('Refusing delete: non-demo staff matched. Review manually.');
    for (const line of unexpectedStaff) console.error(line);
    process.exit(2);
  }
  try {
    const otpOut = psql(urls.auth, DELETE_OTP_SQL);
    console.log('otp_codes:', otpOut.trim().split(/\r?\n/).pop());
  } catch (e) {
    console.error('otp_codes cleanup warning:', (e.stderr || e.message || '').toString().slice(0, 200));
  }
  const delOut = psql(urls.auth, DELETE_USERS_SQL);
  console.log('auth users:', delOut.trim().split(/\r?\n/).pop());

  const ids = dataLines.map((line) => line.split('|')[0]).filter(Boolean);
  const idList = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
  if (urls.drivers && ids.length) {
    for (const [label, sql] of [
      ['kyc_documents', `DELETE FROM kyc_documents WHERE "userId" IN (${idList});`],
      ['incidents', `DELETE FROM incidents WHERE "userId" IN (${idList});`],
      ['driver_profiles', `DELETE FROM driver_profiles WHERE "userId" IN (${idList});`],
    ]) {
      try {
        const out = psql(urls.drivers, sql);
        console.log(`${label}:`, out.trim().split(/\r?\n/).pop());
      } catch (e) {
        console.error(`${label} cleanup warning:`, (e.stderr || e.message || '').toString().slice(0, 200));
      }
    }
  }
  if (urls.payments && ids.length) {
    try {
      const out = psql(
        urls.payments,
        `DELETE FROM wallets WHERE "userId" IN (${idList}) AND "balanceCdf" = 0 AND "heldBalanceCdf" = 0;`,
      );
      console.log('zero-balance wallets:', out.trim().split(/\r?\n/).pop());
    } catch (e) {
      console.error('wallets cleanup warning:', (e.stderr || e.message || '').toString().slice(0, 200));
    }
  }
}

main().catch((e) => {
  const err = (e.stderr || e.stdout || e.message || e).toString();
  console.error(err.slice(0, 800));
  process.exit(1);
});
