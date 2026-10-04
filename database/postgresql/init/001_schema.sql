-- Complete local PostgreSQL schema for fresh development databases.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_health_checks (
    id bigserial PRIMARY KEY,
    checked_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL DEFAULT 'local-dev'
);

CREATE TABLE IF NOT EXISTS roles (
    id integer PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
    id integer PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id integer NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    resource_id integer NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
    "create" boolean NOT NULL DEFAULT false,
    "read" boolean NOT NULL DEFAULT false,
    "update" boolean NOT NULL DEFAULT false,
    "delete" boolean NOT NULL DEFAULT false,
    PRIMARY KEY (role_id, resource_id)
);

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
    display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
    password_hash text NOT NULL CHECK (length(password_hash) > 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_active_email_idx ON users (email) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS user_roles (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id integer NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS auth_sessions_active_token_idx
    ON auth_sessions (token_hash, expires_at) WHERE revoked_at IS NULL;

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
    status text NOT NULL DEFAULT 'Submitted',
    rejection_reason text,
    coordinator_id text,
    coordinator_name text,
    submission_key uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date_time > start_date_time),
    -- Keep the base schema compatible with the local seed events.  The
    -- SPM-99 additive initializer repeats this constraint for existing volumes.
    CONSTRAINT events_status_check CHECK (
        status IN ('Submitted', 'Approved', 'Rejected', 'Confirmed', 'Completed', 'Cancelled')
    ),
    CONSTRAINT events_rejection_reason_check CHECK (
        status <> 'Rejected' OR (
            rejection_reason IS NOT NULL
            AND length(btrim(rejection_reason)) BETWEEN 10 AND 500
        )
    ),
    UNIQUE (organiser_id, submission_key)
);
CREATE INDEX IF NOT EXISTS events_organiser_created_idx ON events (organiser_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_comments (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    parent_id uuid REFERENCES event_comments (id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('clarification', 'reply')),
    author_id text NOT NULL,
    author_name text NOT NULL,
    author_role text NOT NULL CHECK (author_role IN ('coordinator', 'organiser')),
    message text NOT NULL CHECK (length(btrim(message)) > 0),
    awaiting_reply boolean NOT NULL DEFAULT false,
    resolved boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((type = 'clarification' AND parent_id IS NULL) OR (type = 'reply' AND parent_id IS NOT NULL)),
    CHECK (type = 'clarification' OR awaiting_reply = false)
);
CREATE INDEX IF NOT EXISTS event_comments_event_created_idx ON event_comments (event_id, created_at);
CREATE INDEX IF NOT EXISTS event_comments_parent_idx ON event_comments (parent_id);

CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY,
    recipient_id text NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    related_event_id uuid REFERENCES events (id) ON DELETE CASCADE,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx ON notifications (recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS accessibility_features (
    id varchar(50) PRIMARY KEY,
    label varchar(100) NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS facilities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
    description varchar(500),
    category varchar(100) NOT NULL CHECK (length(btrim(category)) > 0),
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS room_layouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
    description varchar(500),
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS venues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
    location varchar(300) NOT NULL CHECK (length(btrim(location)) > 0),
    capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 1000000),
    operating_hours varchar(200) NOT NULL CHECK (length(btrim(operating_hours)) > 0),
    setup_time_minutes integer NOT NULL CHECK (setup_time_minutes >= 0),
    turnaround_time_minutes integer NOT NULL CHECK (turnaround_time_minutes >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS venues_name_location_unique
    ON venues (lower(btrim(name)), lower(btrim(location)));

CREATE TABLE IF NOT EXISTS venue_accessibility (
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    accessibility_id varchar(50) NOT NULL REFERENCES accessibility_features (id),
    PRIMARY KEY (venue_id, accessibility_id)
);

CREATE TABLE IF NOT EXISTS venue_facilities (
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    facility_id uuid NOT NULL REFERENCES facilities (id),
    PRIMARY KEY (venue_id, facility_id)
);

CREATE TABLE IF NOT EXISTS venue_layouts (
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    layout_id uuid NOT NULL REFERENCES room_layouts (id),
    PRIMARY KEY (venue_id, layout_id)
);

CREATE TABLE IF NOT EXISTS venue_images (
    venue_id uuid PRIMARY KEY REFERENCES venues (id) ON DELETE CASCADE,
    file_name varchar(255) NOT NULL CHECK (length(btrim(file_name)) > 0),
    mime_type varchar(100) NOT NULL CHECK (mime_type LIKE 'image/%'),
    byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
    data_url text NOT NULL CHECK (data_url LIKE 'data:image/%'),
    created_at timestamptz NOT NULL DEFAULT now()
);
