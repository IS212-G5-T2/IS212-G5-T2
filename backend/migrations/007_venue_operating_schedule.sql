-- SPM-50: operating hours are structured as selected days plus a daily time range.
-- Preserve earlier text-only schedules for legacy development records with a
-- weekday default and all-day range, which new venue submissions cannot use.
ALTER TABLE venues
    ADD COLUMN IF NOT EXISTS operating_days varchar(9)[] NOT NULL
        DEFAULT ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    ADD COLUMN IF NOT EXISTS operating_start_time time NOT NULL DEFAULT '00:00',
    ADD COLUMN IF NOT EXISTS operating_end_time time NOT NULL DEFAULT '23:59';

ALTER TABLE venues
    DROP CONSTRAINT IF EXISTS venues_operating_schedule_order,
    ADD CONSTRAINT venues_operating_schedule_order
        CHECK (operating_start_time < operating_end_time),
    DROP CONSTRAINT IF EXISTS venues_operating_days_nonempty,
    ADD CONSTRAINT venues_operating_days_nonempty
        CHECK (cardinality(operating_days) BETWEEN 1 AND 7);

ALTER TABLE venues
    ALTER COLUMN operating_days DROP DEFAULT,
    ALTER COLUMN operating_start_time DROP DEFAULT,
    ALTER COLUMN operating_end_time DROP DEFAULT;
