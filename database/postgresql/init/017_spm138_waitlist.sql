-- SPM-138 Join Waiting List: waiting list entries are rows in event_registrations (one row per attendee and event).
-- Adds the Waitlisted and Removed statuses, and the ordering columns used to derive a waiting list position.
-- Position is never stored: it is derived on read from (joined_at, waitlist_seq) among Waitlisted rows of the event.
-- Fresh volumes run this from the init folder. Existing volumes apply backend/migrations/011_spm138_waitlist.sql once.
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
