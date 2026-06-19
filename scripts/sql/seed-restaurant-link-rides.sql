UPDATE restaurants
SET "ownerUserId" = '03e851d0-47c9-4344-865b-527a0549675c'
WHERE name = 'Chez Flore';

SELECT id, name, "ownerUserId" FROM restaurants WHERE name = 'Chez Flore';
