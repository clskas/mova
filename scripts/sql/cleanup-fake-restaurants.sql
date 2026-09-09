-- Remove demo / fake restaurants from mova_rides. Keep production partners (e.g. Resto Beni).
-- Safe defaults: known seed names + stub "Mon restaurant". Does NOT delete "Resto Beni".
--
-- Preview first:
--   SELECT id, name, address, "isActive", "ownerUserId" FROM restaurants ORDER BY name;
--
-- Run (Render / Neon / local):
--   psql "$DATABASE_URL_RIDES" -f scripts/sql/cleanup-fake-restaurants.sql
--
-- Prefer admin UI "Supprimer" after deploy when possible (blocks if active orders exist).

BEGIN;

-- Detach historical deliveries so hard delete is not blocked by FK.
UPDATE deliveries
SET "restaurantId" = NULL
WHERE "restaurantId" IN (
  SELECT id FROM restaurants
  WHERE name IN (
    'Chez Flore',
    'Limoncello',
    'Planet Hollybum',
    'Le Roxy',
    'Cafe Goma',
    'Mon restaurant',
    'Chez Mama'
  )
  AND name <> 'Resto Beni'
)
AND status IN ('DELIVERED', 'CANCELLED');

-- Refuse to touch restaurants that still have active orders (leave them for admin UI).
DELETE FROM restaurants
WHERE name IN (
  'Chez Flore',
  'Limoncello',
  'Planet Hollybum',
  'Le Roxy',
  'Cafe Goma',
  'Mon restaurant',
  'Chez Mama'
)
AND name <> 'Resto Beni'
AND id NOT IN (
  SELECT DISTINCT "restaurantId"
  FROM deliveries
  WHERE "restaurantId" IS NOT NULL
    AND status NOT IN ('DELIVERED', 'CANCELLED')
);

SELECT id, name, address, "isActive", "ownerUserId"
FROM restaurants
ORDER BY name;

COMMIT;
