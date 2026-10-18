-- SPM-136 Cancel an Event and Release its Reservations. Additive and idempotent.
-- Fresh volumes run this from database/postgresql/init; existing databases apply it once from backend/migrations.
-- Supersedes migration 009's venue_bookings status and kind constraints: this file replaces them with
-- versions that also allow 'released'. Apply it only after init 011-016 (database/postgresql/init) and
-- backend migrations 001-010 are installed; each migration is applied once, in numeric order.

-- Cancellation record on the event (status 'Cancelled' already exists in events_status_check).
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_by text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Venue bookings and holds can be released. A released row keeps its event so the cancelled
-- event's history stays traceable; it no longer occupies the venue (availability reads ignore it).
ALTER TABLE venue_bookings ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE venue_bookings
    DROP CONSTRAINT IF EXISTS venue_bookings_status_check,
    DROP CONSTRAINT IF EXISTS venue_bookings_kind_check,
    ADD CONSTRAINT venue_bookings_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'blocked', 'released')),
    ADD CONSTRAINT venue_bookings_kind_check CHECK (
        (status = 'blocked' AND event_id IS NULL
            AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500
            AND hold_expires_at IS NULL)
        OR (status IN ('pending', 'approved', 'rejected', 'released')
            AND event_id IS NOT NULL AND reason IS NULL)
    );

-- Equipment reservations already allow 'Released'; record when it happened.
ALTER TABLE equipment_reservations ADD COLUMN IF NOT EXISTS released_at timestamptz;

-- Registrations of a cancelled event show Cancelled ('Cancelled' is already allowed, migration 011).
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Once-only EventCancelled notification per recipient and event.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_cancelled_once
    ON notifications (recipient_id, related_event_id, type) WHERE type = 'EventCancelled';

-- Releasing reservations leaves the safety record alone (the event is cancelled; nothing is re-requested).
-- Every other change to bookings and equipment still resets the safety check, as in migration 016.
CREATE OR REPLACE FUNCTION trg_venue_bookings_invalidate_safety() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.event_id IS NOT NULL THEN PERFORM invalidate_safety_check(OLD.event_id, 'The venue booking changed'); END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'released' AND OLD.status <> 'released' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR NEW IS DISTINCT FROM OLD THEN
    IF NEW.event_id IS NOT NULL THEN PERFORM invalidate_safety_check(NEW.event_id, 'The venue booking changed'); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_equipment_invalidate_safety() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM invalidate_safety_check(OLD.event_id, 'The equipment request changed');
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'Released' AND OLD.status <> 'Released' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR (NEW.equipment_name, NEW.quantity, NEW.status) IS DISTINCT FROM
                         (OLD.equipment_name, OLD.quantity, OLD.status) THEN
    PERFORM invalidate_safety_check(NEW.event_id, 'The equipment request changed');
  END IF;
  RETURN NEW;
END;
$$;
