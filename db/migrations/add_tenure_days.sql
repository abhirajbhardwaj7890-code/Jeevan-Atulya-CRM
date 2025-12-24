-- ============================================
-- MIGRATION: ADD tenure_days COLUMN
-- ============================================

-- 1. Add the new column
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS tenure_days INTEGER;

-- 2. Backfill existing Daily RDs
-- We convert existing rough month estimates to days so they are not NULL.
-- (Using the logic we had: months * 30.41, rounded)
UPDATE accounts
SET tenure_days = ROUND(term_months * 30.41)
WHERE type = 'Recurring Deposit' 
  AND rd_frequency = 'Daily'
  AND term_months IS NOT NULL
  AND tenure_days IS NULL;

-- 3. Validation
SELECT id, account_number, type, rd_frequency, term_months, tenure_days 
FROM accounts 
WHERE type = 'Recurring Deposit' AND rd_frequency = 'Daily';
