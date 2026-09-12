-- Demo SENGA Business stores (SUPERMARKET / PHARMACY / BOUTIQUE).
-- Safe to re-run: inserts only when the name does not already exist.
-- Requires commerceType column (migration 20260912180000_commerce_type).

INSERT INTO restaurants (
  id, name, cuisine, address, lat, lng, rating,
  "isActive", "isAcceptingOrders", "prepTimeMin", "ownerUserId",
  "commerceType", "menuItems",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'Supermarché Gombe',
  'Épicerie',
  'Boulevard du 30 Juin, Gombe, Kinshasa',
  -4.3050,
  15.3120,
  4.4,
  true,
  true,
  20,
  NULL,
  'SUPERMARKET',
  '{"categories":[{"id":"c-epicerie","name":"Épicerie","sortOrder":0}],"items":[{"name":"Riz 5kg","unitPriceCdf":18000,"categoryId":"c-epicerie","stockQty":40},{"name":"Huile 1L","unitPriceCdf":6500,"categoryId":"c-epicerie","stockQty":60}]}'::jsonb,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM restaurants WHERE name = 'Supermarché Gombe');

INSERT INTO restaurants (
  id, name, cuisine, address, lat, lng, rating,
  "isActive", "isAcceptingOrders", "prepTimeMin", "ownerUserId",
  "commerceType", "menuItems",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'Pharmacie Victoire',
  'Santé',
  'Avenue de la Victoire, Kasa-Vubu, Kinshasa',
  -4.3380,
  15.3005,
  4.5,
  true,
  true,
  15,
  NULL,
  'PHARMACY',
  '{"categories":[{"id":"c-med","name":"Médicaments","sortOrder":0}],"items":[{"name":"Paracétamol 500mg","unitPriceCdf":2500,"categoryId":"c-med","stockQty":100,"requiresPrescription":false},{"name":"Sérum oral","unitPriceCdf":1500,"categoryId":"c-med","stockQty":80}]}'::jsonb,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM restaurants WHERE name = 'Pharmacie Victoire');

INSERT INTO restaurants (
  id, name, cuisine, address, lat, lng, rating,
  "isActive", "isAcceptingOrders", "prepTimeMin", "ownerUserId",
  "commerceType", "menuItems",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'Boutique Matonge',
  'Mode',
  'Avenue Kasa-Vubu, Matonge, Kinshasa',
  -4.3305,
  15.3088,
  4.2,
  true,
  true,
  25,
  NULL,
  'BOUTIQUE',
  '{"categories":[{"id":"c-mode","name":"Accessoires","sortOrder":0}],"items":[{"name":"Sac cabas","unitPriceCdf":12000,"categoryId":"c-mode","stockQty":15},{"name":"Écharpe wax","unitPriceCdf":8000,"categoryId":"c-mode","stockQty":20}]}'::jsonb,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM restaurants WHERE name = 'Boutique Matonge');

-- Ensure Chez Flore stays marked as restaurant if present
UPDATE restaurants
SET "commerceType" = 'RESTAURANT',
    "updatedAt" = NOW()
WHERE name = 'Chez Flore'
  AND ("commerceType" IS DISTINCT FROM 'RESTAURANT');

SELECT id, name, "commerceType", "isActive"
FROM restaurants
WHERE name IN ('Chez Flore', 'Supermarché Gombe', 'Pharmacie Victoire', 'Boutique Matonge')
ORDER BY name;
