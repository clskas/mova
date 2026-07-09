-- Purge operational MOVA data while keeping user accounts and reference config.
-- Keeps: users (mova_auth), geo/pricing/promo/commission config (mova_rides), subscription_plans (mova_payments)

\c mova_auth
TRUNCATE TABLE otp_codes;

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
  places_of_interest,
  poi_suggestions,
  publicites,
  ratings,
  rental_chat_messages,
  rental_inquiries,
  rental_vehicles,
  restaurants,
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
  wallets,
  driver_cash_debts,
  user_subscriptions,
  service_payments,
  payments
RESTART IDENTITY CASCADE;

\c mova_drivers
TRUNCATE TABLE
  vehicles,
  kyc_documents,
  incidents,
  driver_profiles
RESTART IDENTITY CASCADE;

\c mova_notifications
TRUNCATE TABLE
  notifications,
  push_devices
RESTART IDENTITY CASCADE;
