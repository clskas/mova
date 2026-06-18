-- Assign demo completed rides to the live auth user +243900000020
UPDATE rides
SET "driverId" = 'd851b591-d561-4997-8a71-96fcc6ba8d3e'
WHERE id IN ('demo-ride-001', 'demo-ride-002', 'demo-ride-003')
   OR ("driverId" = '22222222-2222-2222-2222-222222222204' AND status = 'COMPLETED');
