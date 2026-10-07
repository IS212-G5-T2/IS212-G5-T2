-- Add SPM-111 equipment records to existing local development volumes.
CREATE TABLE IF NOT EXISTS equipment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_name text NOT NULL CHECK (length(btrim(equipment_name)) > 0),
    equipment_type text NOT NULL CHECK (equipment_type IN ('Audio', 'Visual', 'Furniture', 'Lighting', 'Other')),
    quantity integer NOT NULL CHECK (quantity > 0),
    maintenance_status text NOT NULL CHECK (maintenance_status IN ('Active', 'Under Maintenance', 'Retired')),
    location text NOT NULL CHECK (length(btrim(location)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS equipment_name text;
UPDATE equipment SET equipment_name = equipment_type WHERE equipment_name IS NULL OR length(btrim(equipment_name)) = 0;
ALTER TABLE equipment ALTER COLUMN equipment_name SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_name_not_blank') THEN
        ALTER TABLE equipment ADD CONSTRAINT equipment_name_not_blank CHECK (length(btrim(equipment_name)) > 0);
    END IF;
END $$;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS location text;
UPDATE equipment SET location = 'Unspecified' WHERE location IS NULL OR length(btrim(location)) = 0;
ALTER TABLE equipment ALTER COLUMN location SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_location_not_blank') THEN
        ALTER TABLE equipment ADD CONSTRAINT equipment_location_not_blank CHECK (length(btrim(location)) > 0);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS equipment_created_idx ON equipment (created_at DESC);

INSERT INTO resources (id, name, description) VALUES
    (11, 'Equipment', 'Represents the total equipment inventory managed by Technical Support.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, resource_id, "create", "read", "update", "delete")
VALUES (4, 11, true, true, false, false)
ON CONFLICT (role_id, resource_id) DO UPDATE SET "create" = EXCLUDED."create", "read" = EXCLUDED."read", "update" = EXCLUDED."update", "delete" = EXCLUDED."delete";
