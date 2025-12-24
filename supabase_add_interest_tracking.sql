-- Migration to add last_interest_post_date to accounts table
-- This column tracks when interest was last automatically posted to an account.

ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS last_interest_post_date DATE;

-- Comment for documentation
COMMENT ON COLUMN accounts.last_interest_post_date IS 'Tracks the date when interest was last automatically posted to this account.';
