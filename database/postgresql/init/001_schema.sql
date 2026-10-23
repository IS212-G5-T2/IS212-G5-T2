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
    -- SPM-80: a coordinator's own "can take new event assignments" setting.
    -- It never changes events they are already assigned to.
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_active_email_idx ON users (email) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS equipment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_name text NOT NULL CHECK (length(btrim(equipment_name)) > 0),
    equipment_type text NOT NULL CHECK (equipment_type IN ('Audio', 'Visual', 'Furniture', 'Lighting', 'Other')),
    quantity integer NOT NULL CHECK (quantity > 0),
    maintenance_status text NOT NULL CHECK (maintenance_status IN ('Active', 'Under Maintenance', 'Retired')),
    active_quantity integer NOT NULL DEFAULT 0 CHECK (active_quantity >= 0),
    under_maintenance_quantity integer NOT NULL DEFAULT 0 CHECK (under_maintenance_quantity >= 0),
    retired_quantity integer NOT NULL DEFAULT 0 CHECK (retired_quantity >= 0),
    location text NOT NULL CHECK (length(btrim(location)) > 0),
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT equipment_quantity_breakdown_check CHECK (
        quantity = active_quantity::bigint + under_maintenance_quantity::bigint + retired_quantity::bigint
    )
);
CREATE INDEX IF NOT EXISTS equipment_created_idx ON equipment (created_at DESC);
CREATE INDEX IF NOT EXISTS equipment_is_available_idx ON equipment (is_available);
CREATE UNIQUE INDEX IF NOT EXISTS equipment_name_unique_idx ON equipment (equipment_name);

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
    registration_opens_at timestamptz,
    registration_closes_at timestamptz,
    registration_limit integer NOT NULL DEFAULT 1 CHECK (registration_limit > 0),
    status text NOT NULL DEFAULT 'Submitted',
    rejection_reason text,
    coordinator_id text,
    coordinator_name text,
    submission_key uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date_time > start_date_time),
    CONSTRAINT events_status_check CHECK (
        status IN ('Submitted', 'Approved', 'Rejected', 'Planning', 'Confirmed', 'Completed', 'Cancelled')
    ),
    CONSTRAINT events_registration_window_check CHECK (
        registration_opens_at IS NULL
        OR registration_closes_at IS NULL
        OR registration_closes_at >= registration_opens_at
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
    related_user_id uuid REFERENCES users (id) ON DELETE CASCADE,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx ON notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_related_user_idx ON notifications (related_user_id) WHERE related_user_id IS NOT NULL;

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
    owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
    location varchar(300) NOT NULL CHECK (length(btrim(location)) > 0),
    capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 1000000),
    operating_information varchar(200) NOT NULL CHECK (length(btrim(operating_information)) > 0),
    setup_time_minutes integer NOT NULL CHECK (setup_time_minutes >= 0),
    turnaround_time_minutes integer NOT NULL CHECK (turnaround_time_minutes >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS venues_name_location_unique
    ON venues (lower(btrim(name)), lower(btrim(location)));

CREATE INDEX IF NOT EXISTS venues_owner_user_id_idx ON venues (owner_user_id);

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

CREATE TABLE IF NOT EXISTS event_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    attendee_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'Registered' CHECK (status IN ('Registered', 'Withdrawn')),
    full_name text,
    email text,
    contact_number text,
    special_requirements text,
    withdrawn_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, attendee_id)
);
CREATE INDEX IF NOT EXISTS event_registrations_event_status_idx ON event_registrations (event_id, status);

CREATE TABLE IF NOT EXISTS venue_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    event_id uuid REFERENCES events (id) ON DELETE CASCADE,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'blocked')),
    reason text,
    hold_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > start_at),
    CONSTRAINT venue_bookings_kind_check CHECK (
        (status = 'blocked' AND event_id IS NULL AND reason IS NOT NULL
            AND length(btrim(reason)) BETWEEN 1 AND 500 AND hold_expires_at IS NULL)
        OR (status IN ('pending', 'approved', 'rejected') AND event_id IS NOT NULL AND reason IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS venue_bookings_venue_end_idx ON venue_bookings (venue_id, end_at, start_at);
CREATE INDEX IF NOT EXISTS venue_bookings_event_idx ON venue_bookings (event_id);

CREATE TABLE IF NOT EXISTS equipment_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    equipment_name text NOT NULL CHECK (length(btrim(equipment_name)) > 0),
    quantity integer NOT NULL CHECK (quantity > 0),
    status text NOT NULL DEFAULT 'Requested'
        CHECK (status IN ('Requested', 'Reserved', 'Unavailable', 'Cancelled', 'Released')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equipment_reservations_event_idx ON equipment_reservations (event_id);
CREATE INDEX IF NOT EXISTS equipment_reservations_reserved_name_event_idx
    ON equipment_reservations (equipment_name, event_id)
    WHERE status = 'Reserved';

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
    equipment_name text NOT NULL CHECK (length(btrim(equipment_name)) > 0),
    equipment_type text NOT NULL CHECK (equipment_type IN ('Audio', 'Visual', 'Furniture', 'Lighting', 'Other')),
    quantity integer NOT NULL CHECK (quantity > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    item_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS equipment_request_items_request_idx ON equipment_request_items (request_id, created_at, id);

ALTER TABLE equipment_reservations
    ADD COLUMN IF NOT EXISTS equipment_request_item_id uuid;
DO $$ BEGIN
    ALTER TABLE equipment_reservations
        ADD CONSTRAINT equipment_reservations_request_item_fk
        FOREIGN KEY (equipment_request_item_id) REFERENCES equipment_request_items (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS equipment_reservations_request_item_uidx
    ON equipment_reservations (equipment_request_item_id)
    WHERE equipment_request_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_flagged_changes (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    kind text NOT NULL DEFAULT 'booking_conflict' CHECK (kind IN ('booking_conflict')),
    field text NOT NULL CHECK (field IN ('startDateTime', 'endDateTime', 'expectedAttendance', 'layout', 'facilities', 'equipmentNeeds')),
    original_value jsonb NOT NULL,
    proposed_value jsonb NOT NULL,
    impacts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(impacts) = 'array'),
    equipment_impacts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(equipment_impacts) = 'array'),
    status text NOT NULL DEFAULT 'Needs Review' CHECK (status IN ('Needs Review', 'Applied', 'Rejected')),
    proposed_by text NOT NULL,
    proposed_by_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_by text,
    resolved_by_id text,
    resolved_at timestamptz,
    CONSTRAINT event_flagged_changes_resolution_check CHECK (
        (status = 'Needs Review' AND resolved_at IS NULL AND resolved_by IS NULL)
        OR (status <> 'Needs Review' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS event_flagged_changes_one_pending_per_field
    ON event_flagged_changes (event_id, field) WHERE status = 'Needs Review';
CREATE INDEX IF NOT EXISTS event_flagged_changes_event_created_idx ON event_flagged_changes (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS equipment_audit_trail (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id uuid NOT NULL REFERENCES equipment (id) ON DELETE CASCADE,
    equipment_name text NOT NULL,
    equipment_type text NOT NULL,
    location text NOT NULL,
    maintenance_status text NOT NULL,
    quantity integer NOT NULL,
    active_quantity integer NOT NULL DEFAULT 0 CHECK (active_quantity >= 0),
    under_maintenance_quantity integer NOT NULL DEFAULT 0 CHECK (under_maintenance_quantity >= 0),
    retired_quantity integer NOT NULL DEFAULT 0 CHECK (retired_quantity >= 0),
    is_available boolean NOT NULL,
    change_type text NOT NULL CHECK (change_type IN ('Marked unavailable', 'Reactivated', 'Equipment record updated')),
    reason text,
    changed_by text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT equipment_audit_quantity_breakdown_check CHECK (
        quantity = active_quantity::bigint + under_maintenance_quantity::bigint + retired_quantity::bigint
    )
);
CREATE INDEX IF NOT EXISTS equipment_audit_trail_equipment_idx ON equipment_audit_trail (equipment_id);
CREATE INDEX IF NOT EXISTS equipment_audit_trail_changed_at_idx ON equipment_audit_trail (changed_at DESC);

CREATE TABLE IF NOT EXISTS event_reassignments (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    from_coordinator_id text NOT NULL,
    from_coordinator_name text NOT NULL,
    to_coordinator_id text NOT NULL,
    to_coordinator_name text NOT NULL,
    reassigned_by text NOT NULL,
    reassigned_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS event_reassignments_event_idx ON event_reassignments (event_id, reassigned_at DESC);
CREATE INDEX IF NOT EXISTS event_reassignments_from_idx ON event_reassignments (event_id, from_coordinator_id);
