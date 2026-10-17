-- SPM-135: remember why a safety check was reset, so the coordinator sees
-- "Re-request needed: <reason>" instead of a blank "Request for Safety Check".
-- A reset removes the safety record (and its feedback items) and writes one row here.
-- The row is cleared when the safety check is requested again. Idempotent.

CREATE TABLE IF NOT EXISTS event_safety_resets (
    event_id uuid PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
    reset_at timestamptz NOT NULL,
    reason text NOT NULL
);

-- Replaces the one-argument version from 014/015 (a second overload would make one-argument calls ambiguous).
DROP FUNCTION IF EXISTS invalidate_safety_check(uuid);

CREATE OR REPLACE FUNCTION invalidate_safety_check(
  p_event_id uuid,
  p_reason text DEFAULT 'Event details were updated'
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM safety_check_feedback_items WHERE event_id = p_event_id;
  IF EXISTS (SELECT 1 FROM event_safety_checks WHERE event_id = p_event_id) THEN
    DELETE FROM event_safety_checks WHERE event_id = p_event_id;
    -- The event may be mid-delete (cascade from events); only record a reset for a live event.
    IF EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
      INSERT INTO event_safety_resets (event_id, reset_at, reason)
      VALUES (p_event_id, now(), p_reason)
      ON CONFLICT (event_id) DO UPDATE SET reset_at = now(), reason = p_reason;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trg_events_invalidate_safety() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.event_name, NEW.purpose, NEW.description, NEW.start_date_time, NEW.end_date_time,
      NEW.expected_attendance, NEW.preferred_room_layout, NEW.required_facilities,
      NEW.accessibility_needs, NEW.equipment_needs)
     IS DISTINCT FROM
     (OLD.event_name, OLD.purpose, OLD.description, OLD.start_date_time, OLD.end_date_time,
      OLD.expected_attendance, OLD.preferred_room_layout, OLD.required_facilities,
      OLD.accessibility_needs, OLD.equipment_needs) THEN
    PERFORM invalidate_safety_check(NEW.id, 'Event details were updated');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_venue_bookings_invalidate_safety() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.event_id IS NOT NULL THEN PERFORM invalidate_safety_check(OLD.event_id, 'The venue booking changed'); END IF;
    RETURN OLD;
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
  IF TG_OP = 'INSERT' OR (NEW.equipment_name, NEW.quantity, NEW.status) IS DISTINCT FROM
                         (OLD.equipment_name, OLD.quantity, OLD.status) THEN
    PERFORM invalidate_safety_check(NEW.event_id, 'The equipment request changed');
  END IF;
  RETURN NEW;
END;
$$;
