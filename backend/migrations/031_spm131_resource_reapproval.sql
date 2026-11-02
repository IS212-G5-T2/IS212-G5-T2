-- SPM-131: selected arrangements return through their existing staff approval workflows.
-- Keep the durable safety outcome/feedback while those same rows transition and are reviewed.
ALTER TABLE safety_check_feedback_items
  ADD COLUMN IF NOT EXISTS reapproval_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS reapproval_backfilled_at timestamptz;

CREATE OR REPLACE FUNCTION trg_venue_bookings_invalidate_safety() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'released' AND OLD.status <> 'released' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.event_id = OLD.event_id
     AND (to_jsonb(NEW) - ARRAY['status', 'updated_at', 'reassessment_required', 'hold_expires_at', 'rejection_reason'])
         = (to_jsonb(OLD) - ARRAY['status', 'updated_at', 'reassessment_required', 'hold_expires_at', 'rejection_reason'])
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

CREATE OR REPLACE FUNCTION trg_equipment_invalidate_safety() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'Released' AND OLD.status <> 'Released' THEN
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
          AND COALESCE(feedback.review_arrangements->'equipmentIds', '[]'::jsonb) ? OLD.id::text
     ) THEN
    RETURN NEW;
  END IF;
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

-- One-time, idempotent backfill for safety outcomes recorded before this migration.
-- Only IDs already selected in feedback rows are transitioned; no arrangement rows are removed.
UPDATE safety_check_feedback_items feedback
   SET reapproval_started_at = COALESCE(feedback.reapproval_started_at, now())
  FROM event_safety_checks safety
 WHERE safety.event_id = feedback.event_id
   AND safety.status IN ('changes_needed', 'rejected')
   AND feedback.reapproval_backfilled_at IS NULL;

UPDATE venue_bookings booking
   SET status = 'pending'
 WHERE booking.status = 'approved'
   AND EXISTS (
     SELECT 1
       FROM event_safety_checks safety
       JOIN safety_check_feedback_items feedback ON feedback.event_id = safety.event_id
      WHERE safety.event_id = booking.event_id
        AND safety.status IN ('changes_needed', 'rejected')
        AND feedback.reapproval_backfilled_at IS NULL
        AND COALESCE(feedback.review_arrangements->'venueIds', '[]'::jsonb) ? booking.id::text
   );

INSERT INTO venue_booking_requests (event_id, venue_id, special_request)
SELECT DISTINCT ON (booking.event_id, booking.venue_id) booking.event_id, booking.venue_id, booking.special_request
  FROM venue_bookings booking
 WHERE booking.status = 'pending'
   AND EXISTS (
     SELECT 1
       FROM event_safety_checks safety
       JOIN safety_check_feedback_items feedback ON feedback.event_id = safety.event_id
      WHERE safety.event_id = booking.event_id
        AND safety.status IN ('changes_needed', 'rejected')
        AND feedback.reapproval_backfilled_at IS NULL
        AND COALESCE(feedback.review_arrangements->'venueIds', '[]'::jsonb) ? booking.id::text
   )
 ORDER BY booking.event_id, booking.venue_id, booking.created_at DESC
ON CONFLICT (event_id, venue_id) DO UPDATE SET special_request = EXCLUDED.special_request;

UPDATE equipment_reservations reservation
   SET status = 'Requested', updated_at = now()
 WHERE reservation.status = 'Reserved'
   AND EXISTS (
     SELECT 1
       FROM event_safety_checks safety
       JOIN safety_check_feedback_items feedback ON feedback.event_id = safety.event_id
      WHERE safety.event_id = reservation.event_id
        AND safety.status IN ('changes_needed', 'rejected')
        AND feedback.reapproval_backfilled_at IS NULL
        AND COALESCE(feedback.review_arrangements->'equipmentIds', '[]'::jsonb) ? reservation.id::text
   );

UPDATE equipment_requests request
   SET status = 'Pending Review', decision_reason = NULL, updated_at = now()
 WHERE request.status = 'Reserved'
   AND EXISTS (
     SELECT 1
       FROM equipment_request_items item
       JOIN equipment_reservations reservation ON reservation.equipment_request_item_id = item.id
       JOIN safety_check_feedback_items feedback ON feedback.event_id = reservation.event_id
       JOIN event_safety_checks safety ON safety.event_id = feedback.event_id
      WHERE item.request_id = request.id
        AND safety.status IN ('changes_needed', 'rejected')
        AND feedback.reapproval_backfilled_at IS NULL
        AND COALESCE(feedback.review_arrangements->'equipmentIds', '[]'::jsonb) ? reservation.id::text
   );

UPDATE safety_check_feedback_items feedback
   SET reapproval_backfilled_at = now()
  FROM event_safety_checks safety
 WHERE safety.event_id = feedback.event_id
   AND safety.status IN ('changes_needed', 'rejected')
   AND feedback.reapproval_backfilled_at IS NULL;
