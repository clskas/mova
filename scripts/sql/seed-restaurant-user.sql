INSERT INTO users (id, phone, role, status, "createdAt", "updatedAt")
VALUES (
  COALESCE((SELECT id FROM users WHERE phone = '+243900000030'), gen_random_uuid()::text),
  '+243900000030',
  'RESTAURANT',
  'ACTIVE',
  NOW(),
  NOW()
)
ON CONFLICT (phone) DO UPDATE SET role = 'RESTAURANT', "updatedAt" = NOW();

UPDATE restaurants SET "ownerUserId" = (SELECT id FROM users WHERE phone = '+243900000030' LIMIT 1)
WHERE name = 'Chez Flore';
