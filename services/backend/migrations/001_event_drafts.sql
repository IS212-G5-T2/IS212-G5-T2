-- Apply after development/database/postgresql/init/001_schema.sql.
-- Separate draft storage keeps submitted-event constraints intact.
CREATE TABLE IF NOT EXISTS event_drafts (
  id uuid PRIMARY KEY,
  organiser_id text NOT NULL,
  fields jsonb NOT NULL,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  last_operation uuid,
  event_id uuid REFERENCES events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'Draft' AND event_id IS NULL) OR (status = 'Submitted' AND event_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS event_drafts_owner_updated ON event_drafts(organiser_id, updated_at DESC);
