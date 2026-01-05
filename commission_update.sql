-- Add isIntroducerCommissionPaid column to Members table
ALTER TABLE Members ADD COLUMN is_introducer_commission_paid BOOLEAN DEFAULT FALSE;
