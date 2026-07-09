-- Liens partenaires + portefeuilles démo (sans historique de transactions)
DO $$
DECLARE
  restaurant_user_id TEXT;
  rental_user_id TEXT;
  passenger_user_id TEXT;
BEGIN
  SELECT id INTO restaurant_user_id FROM mova_auth.public.users WHERE phone = '+243900000030' LIMIT 1;
  SELECT id INTO rental_user_id FROM mova_auth.public.users WHERE phone = '+243900000031' LIMIT 1;
  SELECT id INTO passenger_user_id FROM mova_auth.public.users WHERE phone = '+243900000010' LIMIT 1;

  IF restaurant_user_id IS NOT NULL THEN
    UPDATE restaurants SET "ownerUserId" = restaurant_user_id WHERE name = 'Chez Flore';
  END IF;

  IF rental_user_id IS NOT NULL THEN
    UPDATE rental_vehicles
    SET "ownerUserId" = rental_user_id
    WHERE name IN ('Toyota Corolla', 'Toyota RAV4');
  END IF;
END $$;

-- Portefeuilles initiaux pour tests (solde sans transactions)
INSERT INTO wallets (id, "userId", "balanceCdf", "heldBalanceCdf", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u.id, 50000, 0, NOW(), NOW()
FROM mova_auth.public.users u
WHERE u.role IN ('PASSENGER', 'DRIVER')
  AND NOT EXISTS (SELECT 1 FROM wallets w WHERE w."userId" = u.id);

-- Supprimer toute réservation location démo auto-créée
DELETE FROM rental_inquiries;
