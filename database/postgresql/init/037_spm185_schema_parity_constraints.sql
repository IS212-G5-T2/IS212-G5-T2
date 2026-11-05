-- Schema parity constraints (SPM-185).
--
-- These five CHECK constraints existed only in backend/migrations/, so a database built from init/
-- alone was weaker than a migrated one: it accepted blank equipment names, blank venue operating
-- information, null venue owners, and negative equipment quantity buckets. Dev, CI and the
-- disposable test database were all affected, and the constraints only reached a test database if a
-- suite happened to replay the relevant migration mid-run - so whether they were enforced depended
-- on test execution order.
--
-- Definitions and constraint names are mirrored exactly from their source migrations so that a
-- schema dump of a fresh database matches a migrated one, which lets the init-versus-migrations
-- drift check be a strict diff:
--   equipment, equipment_audit_trail  <- backend/migrations/015_spm113_equipment_status_quantities.sql
--   equipment_request_items           <- backend/migrations/012_spm57_equipment_requests.sql
--   venues (operating_information)    <- backend/migrations/006_venue_operating_information.sql
--   venues (owner_user_id)            <- backend/migrations/008_venue_owner_user_id.sql
--
-- No seeded row violates any of them; verified against a fresh database before this file was added.
-- `venues_owner_user_id_required` keeps the source migration's NOT VALID: on a fresh database every
-- row already satisfies it, and PostgreSQL still enforces it on every insert and update, so this is
-- fidelity to the migrated schema rather than a weaker check.

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'equipment'::regclass
                      AND conname = 'equipment_quantity_buckets_nonnegative_check') THEN
        ALTER TABLE equipment ADD CONSTRAINT equipment_quantity_buckets_nonnegative_check
            CHECK (active_quantity >= 0 AND under_maintenance_quantity >= 0 AND retired_quantity >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'equipment_audit_trail'::regclass
                      AND conname = 'equipment_audit_quantity_buckets_nonnegative_check') THEN
        ALTER TABLE equipment_audit_trail ADD CONSTRAINT equipment_audit_quantity_buckets_nonnegative_check
            CHECK (active_quantity >= 0 AND under_maintenance_quantity >= 0 AND retired_quantity >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'equipment_request_items'::regclass
                      AND conname = 'equipment_request_items_equipment_name_nonblank_check') THEN
        ALTER TABLE equipment_request_items ADD CONSTRAINT equipment_request_items_equipment_name_nonblank_check
            CHECK (length(btrim(equipment_name)) > 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'venues'::regclass
                      AND conname = 'venues_operating_information_nonblank') THEN
        ALTER TABLE venues ADD CONSTRAINT venues_operating_information_nonblank
            CHECK (length(btrim(operating_information)) > 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'venues'::regclass
                      AND conname = 'venues_owner_user_id_required') THEN
        ALTER TABLE venues ADD CONSTRAINT venues_owner_user_id_required
            CHECK (owner_user_id IS NOT NULL) NOT VALID;
    END IF;
END $$;
