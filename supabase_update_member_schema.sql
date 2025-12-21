-- Migration to add missing member columns and handle address migration
ALTER TABLE members 
ADD COLUMN IF NOT EXISTS current_address TEXT,
ADD COLUMN IF NOT EXISTS permanent_address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS pin_code TEXT,
ADD COLUMN IF NOT EXISTS residence_type TEXT DEFAULT 'Owned',
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS nominee JSONB;

-- Migrate data from old 'address' column to 'current_address' if current_address is empty
UPDATE members 
SET current_address = address 
WHERE current_address IS NULL AND address IS NOT NULL;

-- Also populate permanent_address if it's empty
UPDATE members 
SET permanent_address = address 
WHERE permanent_address IS NULL AND address IS NOT NULL;
