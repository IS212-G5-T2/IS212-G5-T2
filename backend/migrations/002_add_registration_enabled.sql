ALTER TABLE events
    ADD COLUMN IF NOT EXISTS registration_enabled boolean NOT NULL DEFAULT false;

