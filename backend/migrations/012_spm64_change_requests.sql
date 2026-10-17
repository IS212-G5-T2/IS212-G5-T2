-- SPM-64 Request a Change to a Submitted Event: one row per organiser change request.
-- The request stores the proposed values only; the event itself (and its safety check) is not
-- touched until the assigned coordinator approves it (SPM-65). At most one request per event can be
-- Pending at a time (partial unique index), which also settles concurrent submissions.
-- `changes` is a non-empty JSON array of { "field", "originalValue", "proposedValue" }.
-- Upgrade for existing databases. Fresh volumes get the same change from database/postgresql/init/018_spm64_change_requests.sql.
-- Apply once with: psql -v ON_ERROR_STOP=1 -f backend/migrations/012_spm64_change_requests.sql
-- Idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS event_change_requests (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    requested_by_id text NOT NULL,
    requested_by text NOT NULL,
    changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) > 0),
    reason text CHECK (reason IS NULL OR length(reason) <= 500),
    requires_safety_check boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Denied', 'Withdrawn')),
    decision_reason text,
    decided_by text,
    decided_by_id text,
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT event_change_requests_decision_check CHECK (
        (status = 'Pending' AND decided_at IS NULL AND decided_by IS NULL)
        OR (status <> 'Pending' AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_change_requests_one_pending
    ON event_change_requests (event_id) WHERE status = 'Pending';
CREATE INDEX IF NOT EXISTS event_change_requests_event_created_idx
    ON event_change_requests (event_id, created_at DESC);
