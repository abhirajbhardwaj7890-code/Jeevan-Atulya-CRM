-- ============================================
-- MIGRATION: CORRECT TENURE DISCREPANCIES
-- ============================================
-- This script fixes accounts where 36 months (3 years) was incorrectly calculated 
-- as 37 months (1125 days) due to the previous rounding logic (1095 / 30 = 36.5 -> 37).

-- 1. Identify and Correct Daily RD accounts
-- We look for accounts with exactly 1125 days and 37 months.
UPDATE accounts
SET term_months = 36,
    tenure_days = 1095
WHERE type = 'Recurring Deposit' 
  AND rd_frequency = 'Daily'
  AND term_months = 37
  AND tenure_days = 1125;

-- 2. General check for any RD/FD that should be 36 months but became 37
-- (Optional: only run if you are sure these specific 37-month accounts were meant to be 36)
-- UPDATE accounts
-- SET term_months = 36
-- WHERE type IN ('Recurring Deposit', 'Fixed Deposit')
--   AND term_months = 37
--   AND (maturity_date::date - COALESCE(opening_date, created_at::date)) BETWEEN 1090 AND 1100;

-- 3. Verification
SELECT id, account_number, type, term_months, tenure_days, opening_date, maturity_date
FROM accounts 
WHERE (term_months = 36 AND tenure_days = 1095)
   OR (term_months = 37 AND tenure_days = 1125);
