-- SPM-139: optimistic-lock version for the coordinator's registration settings.
-- Every successful save increments it; a save that sends a stale version is refused with 409 SETTINGS_CONFLICT.
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS registration_settings_version integer NOT NULL DEFAULT 0
        CHECK (registration_settings_version >= 0);
