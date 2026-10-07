-- SPM-97 / SPM-49 / SPM-85: event information during the planning phase.
-- Additive and idempotent, so it can run on a fresh volume (after 001-006 and
-- 007_spm124, which owns venue_bookings) or
-- be applied by hand to an existing local volume:
--   psql "$DATABASE_URL" -f database/postgresql/init/007_spm49_spm85_spm97_event_planning.sql
--
-- Numbered 007 so it runs after dev's 003-006 initializers; the status list
-- below is a superset of the one 003_spm99 sets, so order is safe either way.

-- 'Planning' is the stage between approval and confirmation. 'Approved' events
-- are treated as being in planning too (see backend/HANDOVER.md).
ALTER TABLE events
    DROP CONSTRAINT IF EXISTS events_status_check,
    ADD CONSTRAINT events_status_check CHECK (
        status IN ('Submitted', 'Approved', 'Rejected', 'Planning', 'Confirmed', 'Completed', 'Cancelled')
    );

-- Venue bookings come from SPM-124's `venue_bookings` table
-- (007_spm124_venue_schedule.sql, which sorts and runs before this file).
-- Planning reads that table and maps its statuses; see
-- backend/src/events/event-planning.repository.ts. It only adds a lookup
-- index for an event's own bookings.
CREATE INDEX IF NOT EXISTS venue_bookings_event_idx ON venue_bookings (event_id);

-- Minimal equipment arrangements for an event. Placeholder for the equipment
-- reservation story; link to dev's `equipment` table (SPM-111) once merged.
CREATE TABLE IF NOT EXISTS equipment_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    equipment_name text NOT NULL CHECK (length(btrim(equipment_name)) > 0),
    quantity integer NOT NULL CHECK (quantity > 0),
    status text NOT NULL DEFAULT 'Requested'
        CHECK (status IN ('Requested', 'Reserved', 'Unavailable', 'Cancelled', 'Released')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equipment_reservations_event_idx ON equipment_reservations (event_id);

-- SPM-85: a booking-affecting change awaiting review, and once resolved, the
-- change-history record (original -> proposed, who, when, Applied/Rejected).
-- impacts holds one entry per venue booking, each with an optional per-booking
-- decision (SPM-85 AC7).
CREATE TABLE IF NOT EXISTS event_flagged_changes (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    kind text NOT NULL DEFAULT 'booking_conflict' CHECK (kind IN ('booking_conflict')),
    field text NOT NULL CHECK (field IN (
        'startDateTime', 'endDateTime', 'expectedAttendance', 'layout', 'facilities', 'equipmentNeeds'
    )),
    original_value jsonb NOT NULL,
    proposed_value jsonb NOT NULL,
    impacts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(impacts) = 'array'),
    equipment_impacts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(equipment_impacts) = 'array'),
    status text NOT NULL DEFAULT 'Needs Review' CHECK (status IN ('Needs Review', 'Applied', 'Rejected')),
    proposed_by text NOT NULL,
    proposed_by_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_by text,
    resolved_by_id text,
    resolved_at timestamptz,
    CONSTRAINT event_flagged_changes_resolution_check CHECK (
        (status = 'Needs Review' AND resolved_at IS NULL AND resolved_by IS NULL)
        OR (status <> 'Needs Review' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    )
);
-- At most one change per field can await review at a time.
CREATE UNIQUE INDEX IF NOT EXISTS event_flagged_changes_one_pending_per_field
    ON event_flagged_changes (event_id, field) WHERE status = 'Needs Review';
CREATE INDEX IF NOT EXISTS event_flagged_changes_event_created_idx
    ON event_flagged_changes (event_id, created_at DESC);
