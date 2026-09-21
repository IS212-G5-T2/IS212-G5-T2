-- SPM-38 follow-up: "Under Review" is retired as a distinct event status.
-- Coordinator assignment is automatic (never a meaningful "review started"
-- signal) and a clarification request no longer advances status either (see
-- ClarificationsService). Existing rows are backfilled to Submitted before
-- the constraint is tightened.

UPDATE events SET status = 'Submitted' WHERE status = 'Under_Review';

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events
    ADD CONSTRAINT events_status_check
    CHECK (status IN ('Submitted', 'Approved'));
