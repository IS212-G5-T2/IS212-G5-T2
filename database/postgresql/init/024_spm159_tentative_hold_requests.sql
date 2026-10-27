-- SPM-159: keep local fresh-volume initialization aligned with backend migration 024.
ALTER TABLE venue_bookings
  ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'booking',
  ADD COLUMN IF NOT EXISTS reassessment_required boolean NOT NULL DEFAULT false;

ALTER TABLE venue_bookings
  DROP CONSTRAINT IF EXISTS venue_bookings_request_kind_check,
  ADD CONSTRAINT venue_bookings_request_kind_check
    CHECK (request_kind IN ('booking', 'tentative_hold'));

CREATE INDEX IF NOT EXISTS venue_bookings_pending_hold_idx
  ON venue_bookings (venue_id, start_at, end_at)
  WHERE request_kind = 'tentative_hold' AND status = 'pending';

CREATE OR REPLACE FUNCTION invalidate_pending_tentative_holds_on_event_timing_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.start_date_time IS DISTINCT FROM OLD.start_date_time
     OR NEW.end_date_time IS DISTINCT FROM OLD.end_date_time THEN
    UPDATE venue_bookings
       SET status = 'cancelled', reassessment_required = false
     WHERE event_id = NEW.id
       AND request_kind = 'tentative_hold'
       AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_invalidate_pending_tentative_holds ON events;
CREATE TRIGGER events_invalidate_pending_tentative_holds
AFTER UPDATE OF start_date_time, end_date_time ON events
FOR EACH ROW EXECUTE FUNCTION invalidate_pending_tentative_holds_on_event_timing_change();

CREATE OR REPLACE FUNCTION flag_tentative_holds_after_setup_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.setup_time_minutes IS DISTINCT FROM OLD.setup_time_minutes THEN
    UPDATE venue_bookings
       SET reassessment_required = true
     WHERE venue_id = NEW.id
       AND request_kind = 'tentative_hold'
       AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_flag_tentative_holds_after_setup_change ON venues;
CREATE TRIGGER venues_flag_tentative_holds_after_setup_change
AFTER UPDATE OF setup_time_minutes ON venues
FOR EACH ROW EXECUTE FUNCTION flag_tentative_holds_after_setup_change();
