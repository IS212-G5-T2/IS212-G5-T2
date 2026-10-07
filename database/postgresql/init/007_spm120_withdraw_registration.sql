-- SPM-120 attendee withdrawal. Additive and idempotent so an existing local
-- volume can be upgraded. withdrawn_at is written by the backend from its
-- injected clock (never SQL now()) and is stored as an absolute instant
-- (timestamptz), so it does not depend on any process or session time zone.
-- It stays nullable: Registered rows and rows withdrawn before this change
-- have no timestamp. A registration keeps one row per attendee and event
-- (UNIQUE from 003); re-registering reactivates it and clears withdrawn_at.
ALTER TABLE event_registrations
    ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
