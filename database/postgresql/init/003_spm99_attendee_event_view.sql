-- SPM-99 attendee event-view fields. This is additive so an existing local
-- development volume can be upgraded without losing its event-request data.
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS registration_opens_at timestamptz,
    ADD COLUMN IF NOT EXISTS registration_closes_at timestamptz,
    ADD COLUMN IF NOT EXISTS registration_limit integer;

UPDATE events
SET registration_limit = expected_attendance
WHERE registration_limit IS NULL;

ALTER TABLE events
    ALTER COLUMN registration_limit SET DEFAULT 1,
    ALTER COLUMN registration_limit SET NOT NULL;

ALTER TABLE events
    DROP CONSTRAINT IF EXISTS events_registration_limit_check,
    ADD CONSTRAINT events_registration_limit_check CHECK (registration_limit > 0),
    DROP CONSTRAINT IF EXISTS events_registration_window_check,
    ADD CONSTRAINT events_registration_window_check CHECK (
        registration_opens_at IS NULL
        OR registration_closes_at IS NULL
        OR registration_closes_at >= registration_opens_at
    ),
    DROP CONSTRAINT IF EXISTS events_status_check,
    ADD CONSTRAINT events_status_check CHECK (
        status IN ('Submitted', 'Approved', 'Rejected', 'Confirmed', 'Completed', 'Cancelled')
    );

CREATE TABLE IF NOT EXISTS event_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    attendee_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'Registered' CHECK (status IN ('Registered', 'Withdrawn')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, attendee_id)
);
CREATE INDEX IF NOT EXISTS event_registrations_event_status_idx
    ON event_registrations (event_id, status);
