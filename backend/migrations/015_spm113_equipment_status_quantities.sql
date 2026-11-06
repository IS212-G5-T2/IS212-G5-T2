-- SPM-113 AC8: retain each inventory quantity in its maintenance-status bucket.
-- Existing rows and audit snapshots are backfilled into their former single status.
BEGIN;

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS active_quantity integer;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS under_maintenance_quantity integer;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS retired_quantity integer;

UPDATE equipment
SET active_quantity = CASE WHEN maintenance_status = 'Active' THEN quantity ELSE 0 END,
    under_maintenance_quantity = CASE WHEN maintenance_status = 'Under Maintenance' THEN quantity ELSE 0 END,
    retired_quantity = CASE WHEN maintenance_status = 'Retired' THEN quantity ELSE 0 END
WHERE (active_quantity IS NULL
       AND under_maintenance_quantity IS NULL
       AND retired_quantity IS NULL)
   OR (active_quantity = 0 AND under_maintenance_quantity = 0 AND retired_quantity = 0);

ALTER TABLE equipment ALTER COLUMN active_quantity SET DEFAULT 0;
ALTER TABLE equipment ALTER COLUMN under_maintenance_quantity SET DEFAULT 0;
ALTER TABLE equipment ALTER COLUMN retired_quantity SET DEFAULT 0;
ALTER TABLE equipment ALTER COLUMN active_quantity SET NOT NULL;
ALTER TABLE equipment ALTER COLUMN under_maintenance_quantity SET NOT NULL;
ALTER TABLE equipment ALTER COLUMN retired_quantity SET NOT NULL;

DO $$ BEGIN
    ALTER TABLE equipment ADD CONSTRAINT equipment_quantity_breakdown_check
        CHECK (quantity = active_quantity::bigint + under_maintenance_quantity::bigint + retired_quantity::bigint);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE equipment ADD CONSTRAINT equipment_quantity_buckets_nonnegative_check
        CHECK (active_quantity >= 0 AND under_maintenance_quantity >= 0 AND retired_quantity >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE equipment_audit_trail ADD COLUMN IF NOT EXISTS active_quantity integer;
ALTER TABLE equipment_audit_trail ADD COLUMN IF NOT EXISTS under_maintenance_quantity integer;
ALTER TABLE equipment_audit_trail ADD COLUMN IF NOT EXISTS retired_quantity integer;

UPDATE equipment_audit_trail
SET active_quantity = CASE WHEN maintenance_status = 'Active' THEN quantity ELSE 0 END,
    under_maintenance_quantity = CASE WHEN maintenance_status = 'Under Maintenance' THEN quantity ELSE 0 END,
    retired_quantity = CASE WHEN maintenance_status = 'Retired' THEN quantity ELSE 0 END
WHERE (active_quantity IS NULL
       AND under_maintenance_quantity IS NULL
       AND retired_quantity IS NULL)
   OR (active_quantity = 0 AND under_maintenance_quantity = 0 AND retired_quantity = 0);

ALTER TABLE equipment_audit_trail ALTER COLUMN active_quantity SET DEFAULT 0;
ALTER TABLE equipment_audit_trail ALTER COLUMN under_maintenance_quantity SET DEFAULT 0;
ALTER TABLE equipment_audit_trail ALTER COLUMN retired_quantity SET DEFAULT 0;
ALTER TABLE equipment_audit_trail ALTER COLUMN active_quantity SET NOT NULL;
ALTER TABLE equipment_audit_trail ALTER COLUMN under_maintenance_quantity SET NOT NULL;
ALTER TABLE equipment_audit_trail ALTER COLUMN retired_quantity SET NOT NULL;

DO $$ BEGIN
    ALTER TABLE equipment_audit_trail ADD CONSTRAINT equipment_audit_quantity_breakdown_check
        CHECK (quantity = active_quantity::bigint + under_maintenance_quantity::bigint + retired_quantity::bigint);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE equipment_audit_trail ADD CONSTRAINT equipment_audit_quantity_buckets_nonnegative_check
        CHECK (active_quantity >= 0 AND under_maintenance_quantity >= 0 AND retired_quantity >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
