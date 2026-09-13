CREATE TABLE IF NOT EXISTS event_requests (
  id uuid PRIMARY KEY,
  organisation_id text NOT NULL,
  organiser_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'submitted', 'under_review', 'approved', 'planning', 'confirmed', 'completed', 'cancelled', 'rejected')),
  fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fields) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  last_operation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_requests_organisation_updated_idx ON event_requests (organisation_id, updated_at DESC);
