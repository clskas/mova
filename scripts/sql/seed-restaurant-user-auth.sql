INSERT INTO users (id, phone, role, status, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '+243900000030', 'RESTAURANT', 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone = '+243900000030');

UPDATE users SET role = 'RESTAURANT', "updatedAt" = NOW() WHERE phone = '+243900000030';

INSERT INTO users (id, phone, role, status, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '+243900000031', 'RENTAL_PARTNER', 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone = '+243900000031');

UPDATE users SET role = 'RENTAL_PARTNER', "updatedAt" = NOW() WHERE phone = '+243900000031';

SELECT id, phone, role FROM users WHERE phone IN ('+243900000030', '+243900000031');
