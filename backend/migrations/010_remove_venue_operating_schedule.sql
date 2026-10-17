ALTER TABLE venues
    DROP COLUMN IF EXISTS operating_days,
    DROP COLUMN IF EXISTS operating_start_time,
    DROP COLUMN IF EXISTS operating_end_time;
