-- Comprehensive migration to ensure all required columns exist in the 'members' table
-- Run this in your Supabase SQL Editor

ALTER TABLE members 
ADD COLUMN IF NOT EXISTS current_address TEXT,
ADD COLUMN IF NOT EXISTS permanent_address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS pin_code TEXT,
ADD COLUMN IF NOT EXISTS residence_type TEXT DEFAULT 'Owned',
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS branch_id TEXT,
ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS nominee JSONB,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Migrate data from legacy 'address' column to 'current_address' and 'permanent_address' if they are null
UPDATE members 
SET current_address = address 
WHERE current_address IS NULL AND address IS NOT NULL;

UPDATE members 
SET permanent_address = address 
WHERE permanent_address IS NULL AND address IS NOT NULL;

-- Log confirmation
COMMENT ON TABLE members IS 'Member details including residence and nominee information';
