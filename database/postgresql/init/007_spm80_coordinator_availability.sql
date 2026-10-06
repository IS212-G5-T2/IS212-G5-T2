-- Add SPM-80 coordinator availability to existing local development volumes.
-- Fresh volumes get the column from 001_schema.sql; this is safe to re-run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;
