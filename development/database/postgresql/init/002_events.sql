-- Local sample schema for SPM-36. Safe to apply to an existing local database.
CREATE TABLE IF NOT EXISTS events (
    id uuid PRIMARY KEY,
    organiser_id text NOT NULL,
    organiser_name text NOT NULL,
    organiser_email text NOT NULL,
    event_name varchar(200) NOT NULL CHECK (length(btrim(event_name)) > 0),
    purpose varchar(500) NOT NULL CHECK (length(btrim(purpose)) > 0),
    description text NOT NULL DEFAULT '',
    start_date_time timestamptz NOT NULL,
    end_date_time timestamptz NOT NULL,
    expected_attendance integer NOT NULL CHECK (expected_attendance > 0),
    preferred_room_layout text NOT NULL DEFAULT '',
    required_facilities text[] NOT NULL DEFAULT '{}',
    accessibility_needs text[] NOT NULL DEFAULT '{}',
    attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
    equipment_needs text NOT NULL DEFAULT '',
    registration_enabled boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'Submitted' CHECK (status = 'Submitted'),
    submission_key uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date_time > start_date_time),
    UNIQUE (organiser_id, submission_key)
);
CREATE INDEX IF NOT EXISTS events_organiser_created_idx ON events (organiser_id, created_at DESC);

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS registration_enabled boolean NOT NULL DEFAULT false;
