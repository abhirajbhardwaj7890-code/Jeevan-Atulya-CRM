-- Database Integrity Script: Cascading Deletes
-- Run this script in your Supabase SQL Editor to ensure that deleting a member
-- automatically removes all their accounts, transactions, interactions, and ledger entries.

-- 1. Ensure Accounts are deleted when a Member is deleted
ALTER TABLE IF EXISTS accounts 
DROP CONSTRAINT IF EXISTS accounts_member_id_fkey;

ALTER TABLE IF EXISTS accounts
ADD CONSTRAINT accounts_member_id_fkey 
FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

-- 2. Ensure Transactions are deleted when an Account is deleted
ALTER TABLE IF EXISTS transactions 
DROP CONSTRAINT IF EXISTS transactions_account_id_fkey;

ALTER TABLE IF EXISTS transactions
ADD CONSTRAINT transactions_account_id_fkey 
FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

-- 3. Ensure Interactions are deleted when a Member is deleted
ALTER TABLE IF EXISTS interactions 
DROP CONSTRAINT IF EXISTS interactions_member_id_fkey;

ALTER TABLE IF EXISTS interactions
ADD CONSTRAINT interactions_member_id_fkey 
FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

-- 4. Ensure Society Ledger entries are deleted when a Member is deleted
ALTER TABLE IF EXISTS society_ledger 
DROP CONSTRAINT IF EXISTS society_ledger_member_id_fkey;

ALTER TABLE IF EXISTS society_ledger
ADD CONSTRAINT society_ledger_member_id_fkey 
FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

-- NOTE: If you have additional tables like 'member_documents' or 'guarantors', 
-- you should apply similar constraints to them.
