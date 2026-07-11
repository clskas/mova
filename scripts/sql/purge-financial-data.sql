-- Purge financial MOVA data + operational orders that drive earnings/history displays.
-- Keeps: users, geo/pricing, restaurants catalog, vehicles catalog, commission rates.

\c mova_rides
TRUNCATE TABLE
  carpool_passengers,
  carpool_ratings,
  carpool_trips,
  delivery_chat_messages,
  delivery_events,
  delivery_ratings,
  deliveries,
  errand_chat_messages,
  errand_ratings,
  errand_orders,
  moving_requests,
  ratings,
  rental_chat_messages,
  rental_inquiries,
  ride_chat_messages,
  ride_events,
  rides,
  scheduled_driver_volunteers,
  scheduled_rides,
  tracking_points,
  trip_share_links
RESTART IDENTITY CASCADE;

\c mova_payments
TRUNCATE TABLE
  wallet_transactions,
  wallet_holds,
  driver_cash_debt_cash_requests,
  driver_cash_debts,
  user_subscriptions,
  service_payments,
  payments,
  wallets
RESTART IDENTITY CASCADE;
