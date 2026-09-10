-- Idempotent: reverse ledger-only admin CREDITS (apport virtuel) on SENGA treasury wallet.
-- Does not touch commission / Mobile Money credits. Safe if already applied or balance is 0.
-- amountCdf for DEBIT rows is stored negative (same as WalletService.debit).

WITH platform AS (
  SELECT w.id AS wallet_id, w."balanceCdf" AS balance
  FROM wallets w
  WHERE w."userId" = '00000000-0000-4000-8000-mova00000001'
),
already AS (
  SELECT 1
  FROM wallet_transactions wt
  JOIN platform p ON wt."walletId" = p.wallet_id
  WHERE wt.type = 'DEBIT'
    AND wt.reference IN (
      'reverse_virtual_treasury_float_v1',
      'admin_clear_virtual_apport_3000_v1'
    )
),
virtual_credits AS (
  SELECT COALESCE(SUM(ABS(wt."amountCdf")), 0)::int AS total
  FROM wallet_transactions wt
  JOIN platform p ON wt."walletId" = p.wallet_id
  WHERE wt.type = 'CREDIT'
    AND wt.reference LIKE 'admin_adjust_CREDIT%'
),
prior_clears AS (
  SELECT COALESCE(SUM(ABS(wt."amountCdf")), 0)::int AS total
  FROM wallet_transactions wt
  JOIN platform p ON wt."walletId" = p.wallet_id
  WHERE wt.type = 'DEBIT'
    AND (
      wt.reference IN (
        'reverse_virtual_treasury_float_v1',
        'admin_clear_virtual_apport_3000_v1'
      )
      OR wt.reference LIKE 'admin_adjust_DEBIT%'
      OR wt.description ILIKE '%Annulation apport virtuel%'
    )
),
debit AS (
  SELECT
    p.wallet_id,
    LEAST(p.balance, GREATEST(0, v.total - c.total))::int AS amt
  FROM platform p
  CROSS JOIN virtual_credits v
  CROSS JOIN prior_clears c
  WHERE NOT EXISTS (SELECT 1 FROM already)
    AND LEAST(p.balance, GREATEST(0, v.total - c.total)) > 0
),
updated AS (
  UPDATE wallets w
  SET
    "balanceCdf" = w."balanceCdf" - d.amt,
    "updatedAt" = NOW()
  FROM debit d
  WHERE w.id = d.wallet_id
  RETURNING d.wallet_id, d.amt
)
INSERT INTO wallet_transactions (id, "walletId", "amountCdf", type, description, reference, "createdAt")
SELECT
  gen_random_uuid()::text,
  u.wallet_id,
  -u.amt,
  'DEBIT',
  'Annulation apport virtuel trésorerie (remplacé par recharge Mobile Money)',
  'reverse_virtual_treasury_float_v1',
  NOW()
FROM updated u;
