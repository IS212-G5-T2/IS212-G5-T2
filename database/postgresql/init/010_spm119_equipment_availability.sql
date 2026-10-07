-- SPM-119 "Mark Equipment as Unavailable": an availability flag independent of
-- maintenance_status, plus the shared audit trail of every availability change.
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS equipment_is_available_idx ON equipment (is_available);

CREATE TABLE IF NOT EXISTS equipment_audit_trail (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id uuid NOT NULL REFERENCES equipment (id) ON DELETE CASCADE,
    equipment_name text NOT NULL,
    equipment_type text NOT NULL,
    location text NOT NULL,
    maintenance_status text NOT NULL,
    quantity integer NOT NULL,
    is_available boolean NOT NULL,
    change_type text NOT NULL CHECK (change_type IN ('Marked unavailable', 'Reactivated')),
    -- Required when marking unavailable (AC2/AC7); reactivation has nothing to explain.
    reason text,
    changed_by text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equipment_audit_trail_equipment_idx ON equipment_audit_trail (equipment_id);
CREATE INDEX IF NOT EXISTS equipment_audit_trail_changed_at_idx ON equipment_audit_trail (changed_at DESC);
