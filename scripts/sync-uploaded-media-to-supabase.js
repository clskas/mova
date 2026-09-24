/**
 * One-shot: copy uploaded_media (Postgres) → Supabase Storage.
 * Env: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      SUPABASE_UPLOADS_BUCKET, SUPABASE_KYC_BUCKET
 */
const { Client } = require('pg');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseUrl || !supabaseUrl || !key) {
    console.error('Missing DATABASE_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const limit = Number(process.env.SYNC_LIMIT || 500);
  const { rows } = await client.query(
    `SELECT category, filename, "mimeType" AS "mimeType", data
     FROM uploaded_media
     ORDER BY "createdAt" ASC
     LIMIT $1`,
    [limit],
  );
  console.log(`rows=${rows.length}`);

  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    const bucket =
      row.category === 'kyc'
        ? process.env.SUPABASE_KYC_BUCKET || 'kyc-docs'
        : process.env.SUPABASE_UPLOADS_BUCKET || 'uploads';
    const objectPath = `${row.category}/${row.filename}`;
    const enc = objectPath
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${enc}`;
    try {
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          'Content-Type': row.mimeType || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: row.data,
      });
      if (res.ok) {
        synced += 1;
      } else {
        failed += 1;
        const text = await res.text();
        console.log(`fail ${objectPath} ${res.status} ${text.slice(0, 160)}`);
      }
    } catch (e) {
      failed += 1;
      console.log(`err ${objectPath} ${e.message}`);
    }
  }

  console.log(JSON.stringify({ scanned: rows.length, synced, failed }));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
