-- LIST Play Console / Firebase Test Lab accounts and leftover seed-demo phones.
-- Do NOT run DELETE blindly. Review the SELECT first.
--
-- Play pre-launch emails look like firstnamelastname.12345@gmail.com (no phone).
-- Cloud Test Lab: *@cloudtestlabaccounts.com
-- Seed fixtures: +2439000000xx (Marie Kabila, Jean Mukendi, …) — already blocked from new inserts.
--
-- NEVER match all @gmail.com (real partners / Google-only customers stay).

SELECT id, phone, "firstName", "lastName", email, role, status, "createdAt"
FROM users
WHERE
  COALESCE(email, '') ILIKE '%@cloudtestlabaccounts.com'
  OR (
    (phone IS NULL OR BTRIM(phone) = '')
    AND COALESCE(email, '') ~* '^[a-z0-9]+([._][a-z0-9]+)*\.[0-9]{5}@gmail\.com$'
  )
  OR COALESCE(phone, '') ~ '^\+2439000000[0-9]{2}$'
ORDER BY "createdAt" DESC;

-- After review, optional cleanup (auth DB only). Related driver_profiles should be
-- removed separately by userId. Re-register is allowed (next Play review will recreate testers).
--
-- DELETE FROM otp_codes
-- WHERE phone IN (
--   SELECT phone FROM users
--   WHERE phone IS NOT NULL AND (
--     COALESCE(email, '') ILIKE '%@cloudtestlabaccounts.com'
--     OR COALESCE(phone, '') ~ '^\+2439000000[0-9]{2}$'
--   )
-- );
-- DELETE FROM users
-- WHERE
--   COALESCE(email, '') ILIKE '%@cloudtestlabaccounts.com'
--   OR (
--     (phone IS NULL OR BTRIM(phone) = '')
--     AND COALESCE(email, '') ~* '^[a-z0-9]+([._][a-z0-9]+)*\.[0-9]{5}@gmail\.com$'
--     AND role IN ('PASSENGER', 'DRIVER')
--   )
--   OR COALESCE(phone, '') ~ '^\+2439000000[0-9]{2}$';
