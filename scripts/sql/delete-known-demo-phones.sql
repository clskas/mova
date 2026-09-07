-- OPTIONAL one-shot cleanup of known SENGA demo phones (+2439000000xx).
-- Play / Test Lab Google accounts: see scripts/sql/list-store-testers.sql
-- Do NOT run from Deploy. Do NOT run blindly against production.
--
-- 1) Review rows first (auth DB):
--    SELECT id, phone, "firstName", "lastName", role, status, "createdAt"
--    FROM users
--    WHERE phone ~ '^\+2439000000[0-9]{2}$'
--    ORDER BY phone;
--
-- 2) If every row is clearly a fixture (Marie Kabila, Chez Flore, admin123, Jean Mukendi, …)
--    and NOT a real customer, uncomment the DELETE below.
--
-- DELETE FROM otp_codes WHERE phone ~ '^\+2439000000[0-9]{2}$';
-- DELETE FROM users WHERE phone ~ '^\+2439000000[0-9]{2}$';

SELECT id, phone, "firstName", "lastName", role, status, "createdAt"
FROM users
WHERE phone ~ '^\+2439000000[0-9]{2}$'
ORDER BY phone;
