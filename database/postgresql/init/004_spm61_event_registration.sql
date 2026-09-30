-- SPM-61 attendee registration details. Additive and idempotent so an existing
-- local volume can be upgraded. Detail columns stay nullable because SPM-99
-- registrations exist without them. The full UNIQUE (event_id, attendee_id)
-- from 003 remains the duplicate guard; a withdrawn row is reactivated rather
-- than duplicated.
ALTER TABLE event_registrations
    ADD COLUMN IF NOT EXISTS full_name text,
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS contact_number text,
    ADD COLUMN IF NOT EXISTS special_requirements text;
