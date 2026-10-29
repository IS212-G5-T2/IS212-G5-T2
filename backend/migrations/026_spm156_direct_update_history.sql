-- SPM-156: record changes the coordinator applies immediately (SPM-49 AC3/AC5)
-- in the event change history, not only changes flagged for review (SPM-85).
-- A direct update is stored in event_flagged_changes as kind 'direct_update',
-- already Applied by the coordinator who made it, with no impacts. Any of the
-- ten editable event fields can be recorded, not only the booking-sensitive six.
-- Idempotent: safe to run more than once.
ALTER TABLE event_flagged_changes
  DROP CONSTRAINT IF EXISTS event_flagged_changes_kind_check;
ALTER TABLE event_flagged_changes
  ADD CONSTRAINT event_flagged_changes_kind_check
  CHECK (kind IN ('booking_conflict', 'direct_update'));

ALTER TABLE event_flagged_changes
  DROP CONSTRAINT IF EXISTS event_flagged_changes_field_check;
ALTER TABLE event_flagged_changes
  ADD CONSTRAINT event_flagged_changes_field_check
  CHECK (field IN ('name', 'purpose', 'description', 'startDateTime', 'endDateTime',
                   'expectedAttendance', 'layout', 'facilities', 'accessibility',
                   'equipmentNeeds'));

-- A direct update was never under review: it is Applied, affects no booking or
-- equipment arrangement, and the six booking-sensitive fields stay the only
-- ones that can ever be flagged.
ALTER TABLE event_flagged_changes
  DROP CONSTRAINT IF EXISTS event_flagged_changes_direct_update_check;
ALTER TABLE event_flagged_changes
  ADD CONSTRAINT event_flagged_changes_direct_update_check
  CHECK (
    (kind = 'direct_update'
       AND status = 'Applied'
       AND impacts = '[]'::jsonb
       AND equipment_impacts = '[]'::jsonb)
    OR (kind = 'booking_conflict'
       AND field IN ('startDateTime', 'endDateTime', 'expectedAttendance',
                     'layout', 'facilities', 'equipmentNeeds'))
  );
