-- SPM-83 follows SPM-38's retirement of Under_Review. Keep the additive
-- migration history intact while allowing the terminal Rejected outcome.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events
    ADD CONSTRAINT events_status_check
    CHECK (status IN ('Submitted', 'Approved', 'Rejected'));

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_rejection_reason_check;
ALTER TABLE events
    ADD CONSTRAINT events_rejection_reason_check
    CHECK (
      status <> 'Rejected'
      OR (
        rejection_reason IS NOT NULL
        AND length(btrim(rejection_reason)) BETWEEN 10 AND 500
      )
    );
