-- SPM-155 Request Cancellation of My Event (Organiser): one row per organiser cancellation request.
-- A request never changes the event. The assigned Coordinator accepts it (the SPM-136 cancellation runs in the
-- same transaction) or declines it (nothing else changes). Earlier requests stay as history.
-- `status` is the stored state only: a pending request whose event is later Completed or Cancelled still reads
-- 'pending' here and is shown as Closed by the API (derived on read, never written).
-- At most one request per event can be pending: `pending_key` holds the event id while the request is pending
-- and NULL afterwards, and the unique index on it settles concurrent submissions to one.
-- Fresh volumes run this file from database/postgresql/init/028_spm155_cancellation_requests.sql (an identical copy).
-- Existing databases apply backend/migrations/028_spm155_cancellation_requests.sql once, with:
--   psql -v ON_ERROR_STOP=1 -f backend/migrations/028_spm155_cancellation_requests.sql
-- Idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS event_cancellation_requests (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    requested_by_id text NOT NULL,
    requested_by text NOT NULL,
    reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    requested_at timestamptz NOT NULL,
    decided_by_id text,
    decided_by text,
    decided_at timestamptz,
    pending_key uuid GENERATED ALWAYS AS (CASE WHEN status = 'pending' THEN event_id END) STORED,
    CONSTRAINT event_cancellation_requests_decision_check CHECK (
        (status = 'pending' AND decided_at IS NULL AND decided_by_id IS NULL AND decided_by IS NULL)
        OR (status <> 'pending' AND decided_at IS NOT NULL AND decided_by_id IS NOT NULL AND decided_by IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_cancellation_requests_one_pending
    ON event_cancellation_requests (pending_key);
CREATE INDEX IF NOT EXISTS event_cancellation_requests_event_requested_idx
    ON event_cancellation_requests (event_id, requested_at DESC);
