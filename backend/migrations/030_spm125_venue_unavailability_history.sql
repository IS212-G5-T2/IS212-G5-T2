-- SPM-125 Manage Venue Unavailability Impact, History and Notifications.
-- AC1: an append-only history of unavailable periods. One 'created' entry is written when Venue Staff save a
-- period and one 'ended_early' entry when they end it early, each with the period, its reason, the Venue Staff
-- member who made the change (actor_user_id) and the time of the change (created_at). The application only ever
-- inserts into this table; nothing updates or deletes its rows.
-- AC6 to AC9: the Coordinator notices about a venue change link to the affected booking through
-- notifications.related_booking_id, which SPM-137 adds in migration 029 (apply 029 first).
-- Fresh volumes run this file from database/postgresql/init/030_spm125_venue_unavailability_history.sql (an
-- identical copy). Existing databases apply backend/migrations/030_spm125_venue_unavailability_history.sql once:
--   psql -v ON_ERROR_STOP=1 -f backend/migrations/030_spm125_venue_unavailability_history.sql
-- Idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS venue_unavailability_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    -- The venue_bookings row (status 'blocked') the entry is about. No foreign key, so the history outlives it.
    period_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('created', 'ended_early')),
    start_at timestamptz NOT NULL,
    -- For 'created' the saved end; for 'ended_early' the new (earlier) end.
    end_at timestamptz NOT NULL,
    -- Only for 'ended_early': the end the period had before it was ended early.
    previous_end_at timestamptz,
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
    -- NULL only for periods created before this table existed (shown as "Not recorded").
    actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > start_at),
    CONSTRAINT venue_unavailability_history_previous_end_check CHECK (
        (action = 'created' AND previous_end_at IS NULL)
        OR (action = 'ended_early' AND previous_end_at IS NOT NULL AND previous_end_at > end_at)
    )
);
CREATE INDEX IF NOT EXISTS venue_unavailability_history_venue_idx
    ON venue_unavailability_history (venue_id, created_at DESC, id);

-- Periods saved before SPM-125 get their 'created' entry, with the person not recorded.
INSERT INTO venue_unavailability_history
    (venue_id, period_id, action, start_at, end_at, reason, actor_user_id, created_at)
SELECT b.venue_id, b.id, 'created', b.start_at, b.end_at, b.reason, NULL, b.created_at
  FROM venue_bookings b
 WHERE b.status = 'blocked'
   AND NOT EXISTS (
       SELECT 1 FROM venue_unavailability_history h
        WHERE h.period_id = b.id AND h.action = 'created');
