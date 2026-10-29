-- SPM-156: record every change applied without review in the event change
-- history, not only changes flagged for review (SPM-85):
-- - 'direct_update': applied immediately by the coordinator through Update
--   Event Information (SPM-49 AC3/AC5);
-- - 'change_request': applied by approving an organiser's change request
--   (SPM-65 AC4); proposed_by is the organiser, resolved_by the coordinator.
-- Both are stored in event_flagged_changes already Applied, with no impacts.
-- Any of the ten editable event fields can be recorded, not only the
-- booking-sensitive six.
-- Idempotent: safe to run more than once, including on a database that already
-- ran an earlier version of this file.
ALTER TABLE event_flagged_changes
  DROP CONSTRAINT IF EXISTS event_flagged_changes_kind_check;
ALTER TABLE event_flagged_changes
  ADD CONSTRAINT event_flagged_changes_kind_check
  CHECK (kind IN ('booking_conflict', 'direct_update', 'change_request'));

ALTER TABLE event_flagged_changes
  DROP CONSTRAINT IF EXISTS event_flagged_changes_field_check;
ALTER TABLE event_flagged_changes
  ADD CONSTRAINT event_flagged_changes_field_check
  CHECK (field IN ('name', 'purpose', 'description', 'startDateTime', 'endDateTime',
                   'expectedAttendance', 'layout', 'facilities', 'accessibility',
                   'equipmentNeeds'));

-- A direct update or an approved change request was never under review here:
-- it is Applied and lists no booking or equipment impacts, and the six
-- booking-sensitive fields stay the only ones that can ever be flagged.
ALTER TABLE event_flagged_changes
  DROP CONSTRAINT IF EXISTS event_flagged_changes_direct_update_check;
ALTER TABLE event_flagged_changes
  ADD CONSTRAINT event_flagged_changes_direct_update_check
  CHECK (
    (kind IN ('direct_update', 'change_request')
       AND status = 'Applied'
       AND impacts = '[]'::jsonb
       AND equipment_impacts = '[]'::jsonb)
    OR (kind = 'booking_conflict'
       AND field IN ('startDateTime', 'endDateTime', 'expectedAttendance',
                     'layout', 'facilities', 'equipmentNeeds'))
  );
