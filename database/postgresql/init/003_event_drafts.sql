-- Event draft storage (SPM-37). Consolidated from backend/migrations/001_event_drafts.sql, which
-- remains for existing volumes that predate this file.
--
-- This is the canonical definition. It belongs here because `init/` is the complete schema for a
-- fresh database: until this file existed, `event_drafts` was the only table defined solely in
-- backend/migrations/, so a database built from init/ alone was incomplete. Three different
-- workarounds had grown over that gap - a Compose mount of the migration into initdb, and
-- backend/test/drafts.e2e-spec.ts applying both 001_schema.sql and the migration itself, while CI
-- had no workaround at all and ran against a database without the table.
--
-- Separate draft storage keeps submitted-event constraints intact. Applied after 001_schema.sql for
-- the events(id) reference.
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
