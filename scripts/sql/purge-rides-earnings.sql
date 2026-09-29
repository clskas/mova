-- Purge courses / jobs opérationnels (revenus → 0).
-- Conservé: users, tarifs, promos, restaurants, véhicules location, profils chauffeurs, geo.

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
  ride_share_passengers,
  rides,
  scheduled_driver_volunteers,
  scheduled_rides,
  tracking_points,
  trip_share_links
RESTART IDENTITY CASCADE;
