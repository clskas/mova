-- Ride demo data for admin dashboard (idempotent inserts)
-- Run: docker exec -i mova-postgres-rides-1 psql -U mova -d mova_rides < scripts/seed-ride-demo.sql

INSERT INTO rides (id, "passengerId", "driverId", status, "vehicleType", "pickupLat", "pickupLng", "pickupAddress", "dropoffLat", "dropoffLng", "dropoffAddress", "estimatedFareCdf", "finalFareCdf", "distanceKm", "durationMin", "completedAt", "createdAt", "updatedAt")
SELECT 'demo-ride-001', '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222204', 'COMPLETED', 'STANDARD', -4.31, 15.30, 'Gombe, Avenue Batetela', -4.34, 15.32, 'Limete, Marché Gambela', 8500, 8500, 4.2, 18, NOW(), NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM rides WHERE id = 'demo-ride-001');

INSERT INTO rides (id, "passengerId", "driverId", status, "vehicleType", "pickupLat", "pickupLng", "pickupAddress", "dropoffLat", "dropoffLng", "dropoffAddress", "estimatedFareCdf", "finalFareCdf", "distanceKm", "durationMin", "completedAt", "createdAt", "updatedAt")
SELECT 'demo-ride-002', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222204', 'COMPLETED', 'STANDARD', -4.34, 15.32, 'Kalamu, Kasa-Vubu', -4.33, 15.29, 'Ngaliema, Socimat', 12000, 12000, 6.1, 25, NOW(), NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM rides WHERE id = 'demo-ride-002');

INSERT INTO rides (id, "passengerId", "driverId", status, "vehicleType", "pickupLat", "pickupLng", "pickupAddress", "dropoffLat", "dropoffLng", "dropoffAddress", "estimatedFareCdf", "finalFareCdf", "distanceKm", "durationMin", "completedAt", "createdAt", "updatedAt")
SELECT 'demo-ride-003', '11111111-1111-1111-1111-111111111103', '22222222-2222-2222-2222-222222222204', 'COMPLETED', 'STANDARD', -4.33, 15.30, 'Lingwala, Isiro', -4.32, 15.31, 'Gombe, 30 Juin', 6500, 6500, 3.5, 15, NOW(), NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM rides WHERE id = 'demo-ride-003');

INSERT INTO deliveries (id, "userId", type, status, "pickupLat", "pickupLng", "pickupAddress", "dropoffLat", "dropoffLng", "dropoffAddress", "weightCategory", "estimatedPriceCdf", "createdAt", "updatedAt")
SELECT 'demo-delivery-001', '11111111-1111-1111-1111-111111111101', 'PARCEL', 'IN_TRANSIT', -4.32, 15.31, 'Gombe, Banque BIAC', -4.35, 15.28, 'Bandalungwa, UPN', 'SMALL', 5000, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM deliveries WHERE id = 'demo-delivery-001');

INSERT INTO deliveries (id, "userId", type, status, "restaurantId", "deliveryAddress", "deliveryLat", "deliveryLng", items, "estimatedPriceCdf", "createdAt", "updatedAt")
SELECT 'demo-delivery-002', '11111111-1111-1111-1111-111111111102', 'FOOD', 'PENDING',
  (SELECT id FROM restaurants WHERE name = 'Chez Flore' LIMIT 1),
  'Kintambo, Victoire', -4.33, 15.29, '[{"name":"Poulet moambe","qty":2}]'::jsonb, 18000, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM deliveries WHERE id = 'demo-delivery-002');

INSERT INTO scheduled_rides (id, "passengerId", status, "vehicleType", "scheduledAt", "pickupLat", "pickupLng", "pickupAddress", "dropoffLat", "dropoffLng", "dropoffAddress", "estimatedPriceCdf", "distanceKm", "durationMin", "createdAt", "updatedAt")
SELECT 'demo-sched-001', '11111111-1111-1111-1111-111111111101', 'SCHEDULED', 'STANDARD',
  (CURRENT_DATE + INTERVAL '2 days')::timestamp + TIME '08:00',
  -4.31, 15.30, 'Gombe, Ambassade USA', -4.38, 15.33, 'Aéroport Ndjili', 35000, 12, 35, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM scheduled_rides WHERE id = 'demo-sched-001');

INSERT INTO scheduled_rides (id, "passengerId", status, "vehicleType", "scheduledAt", "pickupLat", "pickupLng", "pickupAddress", "dropoffLat", "dropoffLng", "dropoffAddress", "estimatedPriceCdf", "distanceKm", "durationMin", "createdAt", "updatedAt")
SELECT 'demo-sched-002', '11111111-1111-1111-1111-111111111103', 'SCHEDULED', 'STANDARD',
  (CURRENT_DATE + INTERVAL '3 days')::timestamp + TIME '08:00',
  -4.33, 15.29, 'Ngaliema, Fleuve Congo', -4.36, 15.31, 'Matete, Marché', 15000, 8, 22, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM scheduled_rides WHERE id = 'demo-sched-002');
