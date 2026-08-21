-- Liens restaurants / véhicules (rides DB).
-- Variables psql : restaurant_user_id, rental_user_id (UUID text des users auth).

INSERT INTO restaurants (
  id, name, cuisine, address, lat, lng, rating,
  "isActive", "isAcceptingOrders", "prepTimeMin", "ownerUserId", "menuItems",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'Chez Flore',
  'Congolais',
  'Avenue Batetela, Gombe, Kinshasa',
  -4.3105,
  15.3032,
  4.6,
  true,
  true,
  25,
  :'restaurant_user_id',
  '[{"name":"Poulet moambe","unitPriceCdf":12000,"description":"Poulet mijoté à la sauce moambe"},{"name":"Liboke de poisson","unitPriceCdf":15000},{"name":"Fufu et sauce","unitPriceCdf":8000}]'::jsonb,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM restaurants WHERE name = 'Chez Flore');

UPDATE restaurants
SET "ownerUserId" = :'restaurant_user_id',
    "isActive" = true,
    "isAcceptingOrders" = true,
    "updatedAt" = NOW()
WHERE name = 'Chez Flore';

INSERT INTO rental_vehicles (
  id, name, make, model, year, category, transmission, city, seats,
  "dailyRateCdf", "depositCdf", "ownerName", "ownerContactPhone", "ownerUserId",
  "isActive", "approvalStatus", features, "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'Toyota Corolla',
  'Toyota',
  'Corolla',
  2021,
  'ECONOMY',
  'MANUAL',
  'Kinshasa',
  5,
  45000,
  100000,
  'Partenaire Location',
  '+243900000031',
  :'rental_user_id',
  true,
  'APPROVED',
  '["Climatisation","Bluetooth"]'::jsonb,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM rental_vehicles WHERE name = 'Toyota Corolla');

UPDATE rental_vehicles
SET "ownerUserId" = :'rental_user_id',
    "isActive" = true,
    "approvalStatus" = 'APPROVED',
    "updatedAt" = NOW()
WHERE name = 'Toyota Corolla';

SELECT id, name, "ownerUserId" FROM restaurants WHERE name = 'Chez Flore';
SELECT id, name, "ownerUserId" FROM rental_vehicles WHERE name = 'Toyota Corolla';
