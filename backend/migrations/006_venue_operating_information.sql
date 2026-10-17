-- SPM-50: operating information and operating hours are distinct required fields.
-- Reuse legacy operating hours only as a safe fallback for records created before
-- this field existed; all new API requests must submit both values explicitly.
ALTER TABLE venues
    ADD COLUMN IF NOT EXISTS operating_information varchar(200);

DO $$
BEGIN
    -- Fresh schemas already use operating_information and do not retain this
    -- legacy column. Existing volumes need its values copied before enforcing
    -- the new required field.
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venues'
          AND column_name = 'operating_hours'
    ) THEN
        UPDATE venues
        SET operating_information = operating_hours
        WHERE operating_information IS NULL OR length(btrim(operating_information)) = 0;
    END IF;
END $$;

ALTER TABLE venues
    ALTER COLUMN operating_information SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'venues_operating_information_nonblank'
          AND conrelid = 'venues'::regclass
    ) THEN
        ALTER TABLE venues
            ADD CONSTRAINT venues_operating_information_nonblank
            CHECK (length(btrim(operating_information)) > 0);
    END IF;
END $$;
