-- SPM-138 Join Waiting List: upgrade for existing databases. Fresh volumes get the same change from
-- database/postgresql/init/017_spm138_waitlist.sql. Waiting list entries are rows in event_registrations.
-- Position is derived on read from (joined_at, waitlist_seq); it is never stored.
-- Apply once with: psql -v ON_ERROR_STOP=1 -f backend/migrations/011_spm138_waitlist.sql
-- Idempotent: safe to run again.

ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS event_registrations_status_check;
ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_status_check
    CHECK (status IN ('Registered', 'Withdrawn', 'Cancelled', 'Waitlisted', 'Removed'));

ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS joined_at timestamptz;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS waitlist_seq bigint;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS registered_at timestamptz;

CREATE SEQUENCE IF NOT EXISTS event_registrations_waitlist_seq;

CREATE INDEX IF NOT EXISTS event_registrations_waitlist_order_idx
    ON event_registrations (event_id, status, joined_at, waitlist_seq);
