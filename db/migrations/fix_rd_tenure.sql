-- ============================================
-- FIX RD TENURE ISSUE - MIGRATION SCRIPT (SAFE VERSION)
-- ============================================
-- This script fixes the issue where RD accounts show "0 days" or incorrect tenure
-- Run this in your Supabase SQL Editor

-- ============================================
-- STEP 0: Add updated_at column if missing
-- ============================================
-- This prevents the trigger error
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE accounts ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- ============================================
-- STEP 1: Backfill Missing term_months Values
-- ============================================

-- For RD and FD accounts with maturity_date but NULL term_months,
-- calculate term_months from opening_date to maturity_date
UPDATE accounts
SET term_months = EXTRACT(YEAR FROM AGE(maturity_date::date, COALESCE(opening_date, created_at::date))) * 12 
                + EXTRACT(MONTH FROM AGE(maturity_date::date, COALESCE(opening_date, created_at::date)))
WHERE type IN ('Recurring Deposit', 'Fixed Deposit')
  AND maturity_date IS NOT NULL
  AND term_months IS NULL;

-- For RD/FD accounts without maturity_date but with NULL term_months,
-- set a default of 12 months (1 year)
UPDATE accounts
SET term_months = 12
WHERE type IN ('Recurring Deposit', 'Fixed Deposit')
  AND term_months IS NULL;

-- ============================================
-- STEP 2: Add Default Constraint for Future Records
-- ============================================

-- Set default value for term_months to 12 months
ALTER TABLE accounts 
ALTER COLUMN term_months SET DEFAULT 12;

-- ============================================
-- STEP 3: Data Validation Queries
-- ============================================

-- Check for any remaining NULL term_months in RD/FD accounts
-- (Should return 0 rows after migration)
SELECT 
    id, 
    account_number, 
    type, 
    term_months, 
    maturity_date,
    opening_date,
    created_at
FROM accounts
WHERE type IN ('Recurring Deposit', 'Fixed Deposit')
  AND term_months IS NULL;

-- Verify the backfill worked correctly
SELECT 
    type,
    COUNT(*) as total_accounts,
    COUNT(term_months) as accounts_with_tenure,
    AVG(term_months) as avg_tenure_months,
    MIN(term_months) as min_tenure,
    MAX(term_months) as max_tenure
FROM accounts
WHERE type IN ('Recurring Deposit', 'Fixed Deposit')
GROUP BY type;

-- ============================================
-- STEP 4: Optional - Add NOT NULL Constraint
-- ============================================
-- Uncomment the following if you want to enforce term_months for RD/FD accounts
-- Note: This will prevent creating RD/FD accounts without term_months in the future

-- First, ensure all existing records have values (run steps 1-2 first)
-- Then add the constraint:

-- ALTER TABLE accounts 
-- ADD CONSTRAINT check_rd_fd_term_months 
-- CHECK (
--     (type NOT IN ('Recurring Deposit', 'Fixed Deposit')) 
--     OR 
--     (type IN ('Recurring Deposit', 'Fixed Deposit') AND term_months IS NOT NULL)
-- );

-- ============================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================
-- If you need to undo the default constraint:
-- ALTER TABLE accounts ALTER COLUMN term_months DROP DEFAULT;

-- If you added the CHECK constraint and need to remove it:
-- ALTER TABLE accounts DROP CONSTRAINT IF EXISTS check_rd_fd_term_months;
