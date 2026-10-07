-- SPM-124: event reservations and staff blockouts share one scheduling table.
-- The SPM-50 venue schema is created by 001_schema.sql before this script.
CREATE TABLE IF NOT EXISTS venue_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    event_id uuid REFERENCES events (id) ON DELETE CASCADE,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'blocked')),
    reason text,
    hold_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > start_at),
    CONSTRAINT venue_bookings_kind_check CHECK (
        (status = 'blocked' AND event_id IS NULL
            AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500
            AND hold_expires_at IS NULL)
        OR (status IN ('pending', 'approved', 'rejected')
            AND event_id IS NOT NULL AND reason IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS venue_bookings_venue_end_idx
    ON venue_bookings (venue_id, end_at, start_at);
