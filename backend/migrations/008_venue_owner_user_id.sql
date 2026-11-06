-- SPM-50: keep unknown owners on historical venues unassigned. New venue
-- creation supplies the authenticated local user ID, never a client value.
ALTER TABLE venues
    ADD COLUMN IF NOT EXISTS owner_user_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'venues'::regclass
          AND conname = 'venues_owner_user_id_fkey'
    ) THEN
        ALTER TABLE venues
            ADD CONSTRAINT venues_owner_user_id_fkey
            FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
END $$;

-- NOT VALID preserves historical rows with unknown ownership while PostgreSQL
-- still enforces the check on every new venue insert and future row update.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'venues'::regclass
          AND conname = 'venues_owner_user_id_required'
    ) THEN
        ALTER TABLE venues
            ADD CONSTRAINT venues_owner_user_id_required
            CHECK (owner_user_id IS NOT NULL) NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS venues_owner_user_id_idx ON venues (owner_user_id);
