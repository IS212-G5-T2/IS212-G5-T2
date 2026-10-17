CREATE TABLE IF NOT EXISTS equipment_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    requested_by uuid NOT NULL REFERENCES users (id),
    status text NOT NULL DEFAULT 'Pending Review'
        CHECK (status IN ('Pending Review', 'Reserved', 'Unavailable', 'Cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equipment_requests_event_idx ON equipment_requests (event_id, created_at);
CREATE INDEX IF NOT EXISTS equipment_requests_requester_idx ON equipment_requests (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS equipment_requests_queue_idx ON equipment_requests (status, created_at);

CREATE TABLE IF NOT EXISTS equipment_request_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES equipment_requests (id) ON DELETE CASCADE,
    equipment_name text NOT NULL,
    equipment_type text NOT NULL CHECK (equipment_type IN ('Audio', 'Visual', 'Furniture', 'Lighting', 'Other')),
    quantity integer NOT NULL CHECK (quantity > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE equipment_request_items ADD COLUMN IF NOT EXISTS equipment_name text;
UPDATE equipment_request_items SET equipment_name = equipment_type WHERE equipment_name IS NULL;
ALTER TABLE equipment_request_items ALTER COLUMN equipment_name SET NOT NULL;
DO $$ BEGIN
    ALTER TABLE equipment_request_items ADD CONSTRAINT equipment_request_items_equipment_name_nonblank_check
        CHECK (length(btrim(equipment_name)) > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE equipment_request_items DROP COLUMN IF EXISTS technical_requirements;
ALTER TABLE equipment_request_items ADD COLUMN IF NOT EXISTS item_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS equipment_request_items_request_idx ON equipment_request_items (request_id, created_at, id);
