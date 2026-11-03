-- SPM-131 follow-up: the jsonb equality guard in trg_venue_bookings_invalidate_safety()
-- was blocking the reapproval bypass when extra columns (added by later migrations) were
-- present but not listed in the exclusion array. Remove it and rely solely on the EXISTS
-- condition, matching the simpler pattern already used by trg_equipment_invalidate_safety().
CREATE OR REPLACE FUNCTION trg_venue_bookings_invalidate_safety() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'released' AND OLD.status <> 'released' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.event_id = OLD.event_id
     AND EXISTS (
       SELECT 1
         FROM event_safety_checks safety
         JOIN safety_check_feedback_items feedback ON feedback.event_id = safety.event_id
        WHERE safety.event_id = OLD.event_id
          AND safety.status IN ('changes_needed', 'rejected')
          AND feedback.reapproval_started_at IS NOT NULL
          AND COALESCE(feedback.review_arrangements->'venueIds', '[]'::jsonb) ? OLD.id::text
     ) THEN
    RETURN NEW;
  END IF;
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
