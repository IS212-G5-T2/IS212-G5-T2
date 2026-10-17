-- SPM-62 state only: a registration can be Cancelled (the cancel action is a later story).
-- Adds the value to the status check on event_registrations. Existing rows are preserved.
-- Fresh volumes run this from the init folder. For an existing volume, apply it once by hand.
ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS event_registrations_status_check;
ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_status_check
    CHECK (status IN ('Registered', 'Withdrawn', 'Cancelled'));
