-- SPM-156 fresh database equivalent of backend migration 026.
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
