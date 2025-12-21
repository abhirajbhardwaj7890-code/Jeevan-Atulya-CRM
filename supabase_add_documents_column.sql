-- Add documents column to members table
-- Run this in your Supabase SQL Editor

ALTER TABLE members 
ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb;

-- Update existing rows to have empty array if NULL
UPDATE members 
SET documents = '[]'::jsonb 
WHERE documents IS NULL;

-- Add a comment for documentation
COMMENT ON COLUMN members.documents IS 'Array of member documents with metadata (id, name, type, category, description, uploadDate, url)';
