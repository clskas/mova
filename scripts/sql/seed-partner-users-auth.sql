-- Comptes seed (auth DB). Idempotent : crée ou corrige le rôle.
-- Téléphones whitelist ALLOW_TEST_OTP → OTP 123456.
INSERT INTO users (id, phone, role, status, "firstName", "lastName", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '+243900000001', 'SUPER_ADMIN', 'ACTIVE', 'Admin', 'SENGA', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone = '+243900000001');

UPDATE users
SET role = 'SUPER_ADMIN', status = 'ACTIVE', "updatedAt" = NOW(),
    "firstName" = COALESCE("firstName", 'Admin'),
    "lastName" = COALESCE("lastName", 'SENGA')
WHERE phone = '+243900000001';

INSERT INTO users (id, phone, role, status, "firstName", "lastName", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '+243900000030', 'RESTAURANT', 'ACTIVE', 'Chez', 'Flore', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone = '+243900000030');

UPDATE users
SET role = 'RESTAURANT', status = 'ACTIVE', "updatedAt" = NOW(),
    "firstName" = COALESCE("firstName", 'Chez'),
    "lastName" = COALESCE("lastName", 'Flore')
WHERE phone = '+243900000030';

INSERT INTO users (id, phone, role, status, "firstName", "lastName", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '+243900000031', 'RENTAL_PARTNER', 'ACTIVE', 'Partenaire', 'Location', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone = '+243900000031');

UPDATE users
SET role = 'RENTAL_PARTNER', status = 'ACTIVE', "updatedAt" = NOW(),
    "firstName" = COALESCE("firstName", 'Partenaire'),
    "lastName" = COALESCE("lastName", 'Location')
WHERE phone = '+243900000031';

INSERT INTO users (id, phone, role, status, "firstName", "lastName", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '+243971163574', 'SUPER_ADMIN', 'ACTIVE', 'Super', 'Admin', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone = '+243971163574');

UPDATE users
SET role = 'SUPER_ADMIN', status = 'ACTIVE', "updatedAt" = NOW()
WHERE phone = '+243971163574';

SELECT id, phone, role, status FROM users WHERE phone IN ('+243900000001', '+243971163574', '+243900000030', '+243900000031');
