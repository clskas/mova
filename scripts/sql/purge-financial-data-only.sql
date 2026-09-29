-- Purge UNIQUEMENT les données financières (payment-service).
-- Conservé: users, courses, restaurants, tarifs, promos, plans d'abonnement, profils.

BEGIN;

TRUNCATE TABLE
  wallet_transactions,
  wallet_holds,
  driver_cash_debt_cash_requests,
  driver_cash_debts,
  user_subscriptions,
  service_payments,
  payments,
  hub_payments,
  wallets
RESTART IDENTITY CASCADE;

COMMIT;
