INSERT INTO users (id, phone, role, status, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '+243900000030', 'RESTAURANT', 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone = '+243900000030');

UPDATE users SET role = 'RESTAURANT', "updatedAt" = NOW() WHERE phone = '+243900000030';

SELECT id, phone, role FROM users WHERE phone = '+243900000030';
