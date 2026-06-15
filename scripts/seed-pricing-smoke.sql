INSERT INTO pricing_rules (id, "vehicleType", "baseFareCdf", "perKmCdf", "perMinuteCdf", "minFareCdf", "peakMultiplier", "nightMultiplier", "isActive", "updatedAt", city)
VALUES ('seed-standard', 'STANDARD', 3000, 1500, 200, 5000, 1.3, 1.2, true, NOW(), 'Kinshasa')
ON CONFLICT ("vehicleType", city) DO NOTHING;
