-- SPM-124: one scheduling source for event reservations and staff blockouts.
-- Apply after SPM-50 venue migrations 005-008. Re-running also upgrades the
-- earlier two-table SPM-124 development schema without losing blockout rows.
CREATE TABLE IF NOT EXISTS venue_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    event_id uuid REFERENCES events (id) ON DELETE CASCADE,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    status text NOT NULL,
    reason text,
    hold_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > start_at)
);

ALTER TABLE venue_bookings
    ALTER COLUMN event_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS reason text;
-- Order-safe (SPM-170): migrations 011 and 019 later widen these checks ('released', 'cancelled'). Re-running this
-- file must not narrow a check that is already wide, which would fail on existing released or cancelled rows.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'venue_bookings'::regclass
          AND conname = 'venue_bookings_status_check'
          AND pg_get_constraintdef(oid) LIKE '%released%'
    ) THEN
        ALTER TABLE venue_bookings
            DROP CONSTRAINT IF EXISTS venue_bookings_status_check,
            DROP CONSTRAINT IF EXISTS venue_bookings_kind_check,
            ADD CONSTRAINT venue_bookings_status_check
                CHECK (status IN ('pending', 'approved', 'rejected', 'blocked')),
            ADD CONSTRAINT venue_bookings_kind_check CHECK (
                (status = 'blocked' AND event_id IS NULL
                    AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500
                    AND hold_expires_at IS NULL)
                OR (status IN ('pending', 'approved', 'rejected')
                    AND event_id IS NOT NULL AND reason IS NULL)
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS venue_bookings_venue_end_idx
    ON venue_bookings (venue_id, end_at, start_at);

-- Preserve blockouts if an earlier SPM-124 local migration was already run.
DO $$
BEGIN
    IF to_regclass('public.venue_unavailability') IS NOT NULL THEN
        INSERT INTO venue_bookings
            (id, venue_id, start_at, end_at, status, reason, created_at)
        SELECT id, venue_id, start_at, end_at, 'blocked', reason, created_at
        FROM venue_unavailability;
        DROP TABLE venue_unavailability;
    END IF;
END $$;
