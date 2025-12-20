-- Supabase Database Schema for Jeevan Atulya CRM
-- Run this script in your Supabase SQL Editor

-- ============================================
-- MEMBERS TABLE
-- ============================================
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

-- ============================================
-- ACCOUNTS TABLE
-- ============================================
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TRANSACTIONS TABLE
-- ============================================
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

-- ============================================
-- INTERACTIONS TABLE (CRM)
-- ============================================
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

-- ============================================
-- LEDGER ENTRIES TABLE (Accounting)
-- ============================================
CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
    category TEXT NOT NULL,
    cash_amount NUMERIC(15,2),
    online_amount NUMERIC(15,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    late_payment_fine INTEGER DEFAULT 50,
    grace_period_days INTEGER DEFAULT 7,
    interest_rates JSONB DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (id = 1) -- Ensure only one settings row
);

-- ============================================
-- BRANCHES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- AGENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    branch_id TEXT REFERENCES branches(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_join_date ON members(join_date);

CREATE INDEX IF NOT EXISTS idx_accounts_member ON accounts(member_id);
CREATE INDEX IF NOT EXISTS idx_accounts_number ON accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

CREATE INDEX IF NOT EXISTS idx_interactions_member ON interactions(member_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date ON interactions(date);

CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(date);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_entries(type);

-- ============================================
-- ROW LEVEL SECURITY (Enable if needed)
-- ============================================
-- ALTER TABLE members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON app_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INSERT DEFAULT SETTINGS ROW
-- ============================================
INSERT INTO app_settings (id, interest_rates) 
VALUES (1, '{
  "optionalDeposit": 5.0,
  "compulsoryDeposit": 4.0,
  "fixedDeposit": 6.5,
  "recurringDeposit": 6.0,
  "loan": {
    "Personal": 12.0,
    "Emergency": 10.0,  
    "Education": 9.0,
    "Business": 14.0
  }
}'::jsonb)
ON CONFLICT (id) DO NOTHING;