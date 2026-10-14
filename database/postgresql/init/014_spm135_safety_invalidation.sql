-- SPM-135: a safety check only covers the arrangements it was requested for.
-- Any change to the event's details, venue bookings or equipment lines resets the safety check to
-- "not requested". Status-only changes (for example confirmation) do not reset it. Idempotent.

-- A change resets the safety check to "not requested": the record is removed, so the coordinator
-- must request it again. Any status (pending, approved, changes needed) is reset.
CREATE OR REPLACE FUNCTION invalidate_safety_check(p_event_id uuid) RETURNS void
LANGUAGE sql AS $$
  DELETE FROM event_safety_checks WHERE event_id = p_event_id;
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
    PERFORM invalidate_safety_check(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_venue_bookings_invalidate_safety() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.event_id IS NOT NULL THEN PERFORM invalidate_safety_check(OLD.event_id); END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' OR NEW IS DISTINCT FROM OLD THEN
    IF NEW.event_id IS NOT NULL THEN PERFORM invalidate_safety_check(NEW.event_id); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_equipment_invalidate_safety() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM invalidate_safety_check(OLD.event_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' OR (NEW.equipment_name, NEW.quantity, NEW.status) IS DISTINCT FROM
                         (OLD.equipment_name, OLD.quantity, OLD.status) THEN
    PERFORM invalidate_safety_check(NEW.event_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_invalidate_safety ON events;
CREATE TRIGGER events_invalidate_safety AFTER UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION trg_events_invalidate_safety();

DROP TRIGGER IF EXISTS venue_bookings_invalidate_safety ON venue_bookings;
CREATE TRIGGER venue_bookings_invalidate_safety AFTER INSERT OR UPDATE OR DELETE ON venue_bookings
  FOR EACH ROW EXECUTE FUNCTION trg_venue_bookings_invalidate_safety();

DROP TRIGGER IF EXISTS equipment_reservations_invalidate_safety ON equipment_reservations;
CREATE TRIGGER equipment_reservations_invalidate_safety AFTER INSERT OR UPDATE OR DELETE ON equipment_reservations
  FOR EACH ROW EXECUTE FUNCTION trg_equipment_invalidate_safety();
