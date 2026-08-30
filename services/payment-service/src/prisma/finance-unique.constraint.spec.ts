import { readFileSync } from 'fs';
import { join } from 'path';

describe('finance unique constraints', () => {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const walletTxSql = readFileSync(
    join(__dirname, '../../prisma/migrations/20260830100000_wallet_tx_unique_and_sub_lock/migration.sql'),
    'utf8',
  );
  const hubSql = readFileSync(
    join(__dirname, '../../prisma/migrations/20260830120000_hub_payments_provider_ref_unique/migration.sql'),
    'utf8',
  );

  it('declares unique (reference, type) on wallet_transactions', () => {
    expect(schema).toMatch(/@@unique\(\[reference,\s*type\]\)/);
    expect(walletTxSql).toMatch(/UNIQUE INDEX[\s\S]*wallet_transactions_reference_type_key/);
  });

  it('declares unique providerRef on hub_payments', () => {
    expect(schema).toMatch(/model HubPayment[\s\S]*@@unique\(\[providerRef\]\)/);
    expect(hubSql).toMatch(/UNIQUE INDEX[\s\S]*hub_payments_providerRef_key/);
  });
});
