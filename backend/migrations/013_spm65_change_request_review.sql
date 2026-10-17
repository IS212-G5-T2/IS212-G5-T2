-- Migration copy of database/postgresql/init/019_spm65_change_request_review.sql for existing volumes (apply after 012).
-- SPM-65 Review and Approve/Deny a Change Request.
-- - The coordinator approves or denies a pending request (decision_reason holds the denial reason).
-- - AC11: a pending request is closed automatically when the organiser withdraws it (status 'Withdrawn',
--   already allowed) or the event is cancelled (status 'Closed').
-- - recheck: the venue bookings and equipment reservations an approved change affects (AC9), each
--   { "id", "kind": "venue"|"equipment", "refId", "name", "details": [..], "checkedAt"?, "checkedBy"? }.
--   The coordinator ticks each one off once re-checked.
-- - safety_check_reset: whether approving reset an existing safety check (AC8).
-- - event_change_request_audit: one append-only row per outcome (Approved, Denied, Withdrawn, Closed) (AC10).
-- Fresh volumes run this from the init folder. Existing volumes apply backend/migrations/013_spm65_change_request_review.sql once.
-- Idempotent: safe to run again.

ALTER TABLE event_change_requests
    ADD COLUMN IF NOT EXISTS recheck jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS safety_check_reset boolean NOT NULL DEFAULT false;

ALTER TABLE event_change_requests DROP CONSTRAINT IF EXISTS event_change_requests_status_check;
ALTER TABLE event_change_requests ADD CONSTRAINT event_change_requests_status_check
    CHECK (status IN ('Pending', 'Approved', 'Denied', 'Withdrawn', 'Closed'));

ALTER TABLE event_change_requests DROP CONSTRAINT IF EXISTS event_change_requests_recheck_check;
ALTER TABLE event_change_requests ADD CONSTRAINT event_change_requests_recheck_check
    CHECK (jsonb_typeof(recheck) = 'array');

-- A denial always carries its reason (10 to 500 characters, like an event rejection).
ALTER TABLE event_change_requests DROP CONSTRAINT IF EXISTS event_change_requests_denial_reason_check;
ALTER TABLE event_change_requests ADD CONSTRAINT event_change_requests_denial_reason_check
    CHECK (status <> 'Denied' OR (decision_reason IS NOT NULL AND length(decision_reason) BETWEEN 10 AND 500));

CREATE TABLE IF NOT EXISTS event_change_request_audit (
    id uuid PRIMARY KEY,
    change_request_id uuid NOT NULL REFERENCES event_change_requests (id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    outcome text NOT NULL CHECK (outcome IN ('Approved', 'Denied', 'Withdrawn', 'Closed')),
    changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array'),
    requested_by_id text NOT NULL,
    requested_by text NOT NULL,
    decided_by_id text,
    decided_by text NOT NULL,
    reason text,
    decided_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_change_request_audit_event_idx
    ON event_change_request_audit (event_id, decided_at DESC);
-- One outcome per request: a request is decided once.
CREATE UNIQUE INDEX IF NOT EXISTS event_change_request_audit_one_outcome
    ON event_change_request_audit (change_request_id);

-- Append-only: entries are never edited. (Rows are still removed with their event by ON DELETE CASCADE.)
CREATE OR REPLACE FUNCTION trg_change_request_audit_no_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'event_change_request_audit is append-only';
END;
$$;
DROP TRIGGER IF EXISTS change_request_audit_no_update ON event_change_request_audit;
CREATE TRIGGER change_request_audit_no_update BEFORE UPDATE ON event_change_request_audit
  FOR EACH ROW EXECUTE FUNCTION trg_change_request_audit_no_update();
