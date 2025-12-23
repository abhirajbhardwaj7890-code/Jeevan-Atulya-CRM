-- ========================================================
-- JEEVAN ATULYA CRM - CONSOLIDATED SQL SCRIPT
-- ========================================================

-- PART 1: MIGRATION (Run this if you have an existing database)
-- --------------------------------------------------------
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS emi NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS original_amount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS opening_date DATE,
ADD COLUMN IF NOT EXISTS maturity_processed BOOLEAN DEFAULT FALSE;

-- PART 2: COMPLETE SCHEMA (For reference or fresh setup)
-- --------------------------------------------------------

-- MEMBERS TABLE
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    father_name TEXT,
    mother_name TEXT,
    current_address TEXT,
    permanent_address TEXT,
    city TEXT,
    pin_code TEXT,
    date_of_birth DATE,
    join_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Pending', 'Inactive')),
    avatar_url TEXT,
    risk_score INTEGER DEFAULT 0,
    agent_id TEXT,
    residence_type TEXT,
    last_printed_transaction_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    account_number TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Share Capital', 'Compulsory Deposit', 'Optional Deposit', 'Fixed Deposit', 'Recurring Deposit', 'Loan')),
    loan_type TEXT,
    balance NUMERIC(15,2) DEFAULT 0,
    original_amount NUMERIC(15,2),
    initial_amount NUMERIC(15,2),
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Closed', 'Matured', 'Defaulted')),
    currency TEXT DEFAULT 'INR',
    interest_rate NUMERIC(5,2) DEFAULT 0,
    term_months INTEGER,
    maturity_date DATE,
    emi NUMERIC(15,2),
    rd_frequency TEXT,
    low_balance_alert_threshold NUMERIC(15,2),
    opening_date DATE,
    maturity_processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    amount NUMERIC(15,2) NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    description TEXT,
    payment_method TEXT,
    cash_amount NUMERIC(15,2),
    online_amount NUMERIC(15,2),
    utr_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INTERACTIONS TABLE
CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    notes TEXT NOT NULL,
    sentiment TEXT,
    staff_name TEXT,
    date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SOCIETY LEDGER
CREATE TABLE IF NOT EXISTS society_ledger (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
    category TEXT NOT NULL,
    cash_amount NUMERIC(15,2),
    online_amount NUMERIC(15,2),
    utr_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_accounts_member ON accounts(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

-- UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_members_updated_at ON members;
CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
