-- Complete local PostgreSQL schema for fresh development databases, in its final state.
-- Every table, column, constraint and index is declared here directly; git history records how it
-- evolved. Functions and triggers live in 003_functions_triggers.sql, which runs after the seed data
-- in 002_seed_data.sql so that loading sample rows does not fire them.
--
-- This file can create a database but can no longer upgrade one: CREATE ... IF NOT EXISTS skips a
-- table that already exists, so a column added here never reaches an older volume. Recreate the volume.
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
    ),
    -- Mirrors backend/migrations/015 by name so a catalogue diff against a migrated database stays clean.
    CONSTRAINT equipment_quantity_buckets_nonnegative_check CHECK (
        active_quantity >= 0 AND under_maintenance_quantity >= 0 AND retired_quantity >= 0
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
    -- The coordinator's "no equipment needed" confirmation (planning checklist).
    equipment_confirmed_at timestamptz,
    -- Cancellation record; the status itself is events.status = 'Cancelled'.
    cancelled_by text,
    cancelled_at timestamptz,
    -- Optimistic-lock version for the coordinator's registration settings: every successful save
    -- increments it and a save with a stale version is refused (409 SETTINGS_CONFLICT).
    registration_settings_version integer NOT NULL DEFAULT 0 CHECK (registration_settings_version >= 0),
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

-- Status history and the once-only EventConfirmed notification (see notifications below).
CREATE TABLE IF NOT EXISTS event_status_history (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    from_status text NOT NULL,
    to_status text NOT NULL,
    actor_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_status_history_event_idx ON event_status_history (event_id, created_at);

-- The operational safety check request. A change to the event's details, venue bookings or equipment
-- lines removes the record (see invalidate_safety_check in 003_functions_triggers.sql), so the
-- coordinator must request it again.
CREATE TABLE IF NOT EXISTS event_safety_checks (
    event_id uuid PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('pending', 'changes_needed', 'approved', 'rejected')),
    requested_at timestamptz NOT NULL,
    requested_by text NOT NULL,
    approver_name text,
    feedback text,
    decided_at timestamptz
);

-- Why a safety check was reset, so the coordinator sees "Re-request needed: <reason>" instead of a
-- blank "Request for Safety Check". Cleared when the safety check is requested again.
CREATE TABLE IF NOT EXISTS event_safety_resets (
    event_id uuid PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
    reset_at timestamptz NOT NULL,
    reason text NOT NULL
);

-- When the Safety Officer requests changes each feedback item is listed and the coordinator resolves
-- each one (resolved_by_coordinator_at); re-requesting needs all items resolved. review_arrangements
-- names the venue and equipment rows the coordinator must review before resubmission, kept separate
-- from their operational status. A reset safety check drops its feedback items too.
CREATE TABLE IF NOT EXISTS safety_check_feedback_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    feedback_text text NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    resolved_by_coordinator_at timestamptz,
    review_arrangements jsonb NOT NULL DEFAULT '{"venueIds": [], "equipmentIds": []}'::jsonb,
    reapproval_started_at timestamptz,
    reapproval_backfilled_at timestamptz,
    CONSTRAINT safety_feedback_review_arrangements_shape CHECK (
        jsonb_typeof(review_arrangements) = 'object'
        AND jsonb_typeof(review_arrangements->'venueIds') = 'array'
        AND jsonb_typeof(review_arrangements->'equipmentIds') = 'array'
    )
);
CREATE INDEX IF NOT EXISTS idx_safety_feedback_event ON safety_check_feedback_items (event_id);

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
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Both mirror backend/migrations (006 and 008) by name so a catalogue diff against a migrated
    -- database stays clean. venues_owner_user_id_required is NOT VALID in the migrated schema, which
    -- CREATE TABLE cannot express; here it is validated, and the column is NOT NULL regardless.
    CONSTRAINT venues_operating_information_nonblank CHECK (length(btrim(operating_information)) > 0),
    CONSTRAINT venues_owner_user_id_required CHECK (owner_user_id IS NOT NULL)
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
    status text NOT NULL DEFAULT 'Registered',
    full_name text,
    email text,
    contact_number text,
    special_requirements text,
    withdrawn_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- Shown on the registration of a cancelled event.
    cancellation_reason text,
    -- Waiting list entries are rows here (one per attendee and event). The position is never stored: it is
    -- derived on read from (joined_at, waitlist_seq) among the event's Waitlisted rows.
    joined_at timestamptz,
    waitlist_seq bigint,
    removed_at timestamptz,
    registered_at timestamptz,
    CONSTRAINT event_registrations_status_check
        CHECK (status IN ('Registered', 'Withdrawn', 'Cancelled', 'Waitlisted', 'Removed')),
    UNIQUE (event_id, attendee_id)
);
CREATE INDEX IF NOT EXISTS event_registrations_event_status_idx ON event_registrations (event_id, status);
CREATE SEQUENCE IF NOT EXISTS event_registrations_waitlist_seq;
CREATE INDEX IF NOT EXISTS event_registrations_waitlist_order_idx
    ON event_registrations (event_id, status, joined_at, waitlist_seq);

CREATE TABLE IF NOT EXISTS venue_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    event_id uuid REFERENCES events (id) ON DELETE CASCADE,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    status text NOT NULL,
    reason text,
    hold_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- A released row keeps its event so a cancelled event's history stays traceable; it no longer
    -- occupies the venue (availability reads ignore it).
    released_at timestamptz,
    -- The rejection reason has its own column so the blocked-period reason rules in
    -- venue_bookings_kind_check stay unchanged.
    rejection_reason text,
    -- Each booking attempt keeps its own note.
    special_request text,
    request_kind text NOT NULL DEFAULT 'booking',
    reassessment_required boolean NOT NULL DEFAULT false,
    -- Persist expiry once while preserving the original expiry deadline.
    hold_expiry_processed_at timestamptz,
    -- Set once the 48-hour expiry reminder was sent, so each hold is reminded exactly once.
    hold_reminder_sent_at timestamptz,
    CHECK (end_at > start_at),
    CONSTRAINT venue_bookings_status_check CHECK (
        status IN ('pending', 'approved', 'rejected', 'blocked', 'released', 'cancelled', 'expired')
    ),
    CONSTRAINT venue_bookings_kind_check CHECK (
        (status = 'blocked' AND event_id IS NULL AND reason IS NOT NULL
            AND length(btrim(reason)) BETWEEN 1 AND 500 AND hold_expires_at IS NULL)
        OR (status IN ('pending', 'approved', 'rejected', 'released', 'cancelled')
            AND event_id IS NOT NULL AND reason IS NULL)
        OR (status = 'expired' AND request_kind = 'tentative_hold'
            AND event_id IS NOT NULL AND reason IS NULL AND hold_expires_at IS NOT NULL)
    ),
    CONSTRAINT venue_bookings_rejection_reason_check CHECK (
        rejection_reason IS NULL
        OR (status = 'rejected' AND length(btrim(rejection_reason)) BETWEEN 1 AND 1000)
    ),
    CONSTRAINT venue_bookings_request_kind_check CHECK (request_kind IN ('booking', 'tentative_hold')),
    CONSTRAINT venue_bookings_approved_tentative_hold_expiry_check CHECK (
        request_kind <> 'tentative_hold' OR status <> 'approved' OR hold_expires_at IS NOT NULL
    )
);
CREATE INDEX IF NOT EXISTS venue_bookings_venue_end_idx ON venue_bookings (venue_id, end_at, start_at);
CREATE INDEX IF NOT EXISTS venue_bookings_event_idx ON venue_bookings (event_id);
CREATE INDEX IF NOT EXISTS venue_bookings_pending_hold_idx
    ON venue_bookings (venue_id, start_at, end_at)
    WHERE request_kind = 'tentative_hold' AND status = 'pending';

-- Request details are kept apart from the UUID booking lifecycle/history rows.
CREATE TABLE IF NOT EXISTS venue_booking_requests (
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    special_request text,
    PRIMARY KEY (event_id, venue_id),
    CHECK (length(special_request) <= 1000)
);

-- Append-only audit trail of venue booking review decisions.
CREATE TABLE IF NOT EXISTS booking_review_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES venue_bookings (id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    action text NOT NULL CHECK (action IN ('approved', 'rejected')),
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT booking_review_log_reason_check CHECK (
        (action = 'rejected' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000)
        OR (action = 'approved' AND reason IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS booking_review_log_booking_idx ON booking_review_log (booking_id, created_at);

CREATE TABLE IF NOT EXISTS equipment_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    requested_by uuid NOT NULL REFERENCES users (id),
    status text NOT NULL DEFAULT 'Pending Review'
        CHECK (status IN ('Pending Review', 'Reserved', 'Unavailable', 'Cannot Provide', 'Cancelled')),
    -- SPM-58 AC8/AC9: why Technical Support cannot fulfil a request; shown to the event
    -- coordinator. Required (non-blank) exactly when the request is Cannot Provide.
    decision_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT equipment_requests_cannot_provide_reason_check CHECK (
        status <> 'Cannot Provide'
        OR (decision_reason IS NOT NULL AND length(btrim(decision_reason)) BETWEEN 1 AND 500)
    )
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
    item_order integer NOT NULL DEFAULT 0,
    -- Mirrors backend/migrations/012 by name so a catalogue diff against a migrated database stays clean.
    CONSTRAINT equipment_request_items_equipment_name_nonblank_check CHECK (length(btrim(equipment_name)) > 0)
);
CREATE INDEX IF NOT EXISTS equipment_request_items_request_idx ON equipment_request_items (request_id, created_at, id);

CREATE TABLE IF NOT EXISTS equipment_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    equipment_name text NOT NULL CHECK (length(btrim(equipment_name)) > 0),
    quantity integer NOT NULL CHECK (quantity > 0),
    status text NOT NULL DEFAULT 'Requested'
        CHECK (status IN ('Requested', 'Reserved', 'Unavailable', 'Cancelled', 'Released')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    equipment_request_item_id uuid,
    -- When a released reservation was released (event cancellation).
    released_at timestamptz,
    CONSTRAINT equipment_reservations_request_item_fk
        FOREIGN KEY (equipment_request_item_id) REFERENCES equipment_request_items (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS equipment_reservations_event_idx ON equipment_reservations (event_id);
CREATE INDEX IF NOT EXISTS equipment_reservations_reserved_name_event_idx
    ON equipment_reservations (equipment_name, event_id)
    WHERE status = 'Reserved';
CREATE UNIQUE INDEX IF NOT EXISTS equipment_reservations_request_item_uidx
    ON equipment_reservations (equipment_request_item_id)
    WHERE equipment_request_item_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY,
    recipient_id text NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    related_event_id uuid REFERENCES events (id) ON DELETE CASCADE,
    related_user_id uuid REFERENCES users (id) ON DELETE CASCADE,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- The booking or request a decision notification links to, so the notification bell can open that
    -- one booking or request. Deleting the booking or request removes its notification.
    related_booking_id uuid REFERENCES venue_bookings (id) ON DELETE CASCADE,
    related_equipment_request_id uuid REFERENCES equipment_requests (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx ON notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_related_user_idx ON notifications (related_user_id) WHERE related_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_related_booking_idx
    ON notifications (related_booking_id) WHERE related_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_related_equipment_request_idx
    ON notifications (related_equipment_request_id) WHERE related_equipment_request_id IS NOT NULL;
-- Once-only notification per recipient and event.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_confirmed_once
    ON notifications (recipient_id, related_event_id, type) WHERE type = 'EventConfirmed';
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_cancelled_once
    ON notifications (recipient_id, related_event_id, type) WHERE type = 'EventCancelled';

CREATE TABLE IF NOT EXISTS event_flagged_changes (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    kind text NOT NULL DEFAULT 'booking_conflict',
    field text NOT NULL,
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
    ),
    CONSTRAINT event_flagged_changes_kind_check
        CHECK (kind IN ('booking_conflict', 'direct_update', 'change_request')),
    CONSTRAINT event_flagged_changes_field_check
        CHECK (field IN ('name', 'purpose', 'description', 'startDateTime', 'endDateTime',
                         'expectedAttendance', 'layout', 'facilities', 'accessibility',
                         'equipmentNeeds')),
    -- A direct update or an approved change request was never under review here: it is Applied and
    -- lists no booking or equipment impacts, and the six booking-sensitive fields stay the only ones
    -- that can ever be flagged.
    CONSTRAINT event_flagged_changes_direct_update_check CHECK (
        (kind IN ('direct_update', 'change_request')
           AND status = 'Applied'
           AND impacts = '[]'::jsonb
           AND equipment_impacts = '[]'::jsonb)
        OR (kind = 'booking_conflict'
           AND field IN ('startDateTime', 'endDateTime', 'expectedAttendance',
                         'layout', 'facilities', 'equipmentNeeds'))
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
    ),
    -- Mirrors backend/migrations/015 by name so a catalogue diff against a migrated database stays clean.
    CONSTRAINT equipment_audit_quantity_buckets_nonnegative_check CHECK (
        active_quantity >= 0 AND under_maintenance_quantity >= 0 AND retired_quantity >= 0
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

-- One row per organiser change request. It stores the proposed values only: the event itself (and its
-- safety check) is not touched until the assigned coordinator approves it. At most one request per
-- event can be Pending at a time (partial unique index), which also settles concurrent submissions.
-- `changes` is a non-empty JSON array of { "field", "originalValue", "proposedValue" }. `recheck` lists
-- the venue bookings and equipment reservations an approved change affects, each
-- { "id", "kind": "venue"|"equipment", "refId", "name", "details": [..], "checkedAt"?, "checkedBy"? }.
-- A pending request is closed automatically (status 'Closed') when the event is cancelled.
CREATE TABLE IF NOT EXISTS event_change_requests (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    requested_by_id text NOT NULL,
    requested_by text NOT NULL,
    changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) > 0),
    reason text CHECK (reason IS NULL OR length(reason) <= 500),
    requires_safety_check boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'Pending',
    decision_reason text,
    decided_by text,
    decided_by_id text,
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    recheck jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Whether approving reset an existing safety check.
    safety_check_reset boolean NOT NULL DEFAULT false,
    CONSTRAINT event_change_requests_status_check
        CHECK (status IN ('Pending', 'Approved', 'Denied', 'Withdrawn', 'Closed')),
    CONSTRAINT event_change_requests_decision_check CHECK (
        (status = 'Pending' AND decided_at IS NULL AND decided_by IS NULL)
        OR (status <> 'Pending' AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
    ),
    CONSTRAINT event_change_requests_recheck_check CHECK (jsonb_typeof(recheck) = 'array'),
    -- A denial always carries its reason (10 to 500 characters, like an event rejection).
    CONSTRAINT event_change_requests_denial_reason_check
        CHECK (status <> 'Denied' OR (decision_reason IS NOT NULL AND length(decision_reason) BETWEEN 10 AND 500))
);
CREATE UNIQUE INDEX IF NOT EXISTS event_change_requests_one_pending
    ON event_change_requests (event_id) WHERE status = 'Pending';
CREATE INDEX IF NOT EXISTS event_change_requests_event_created_idx
    ON event_change_requests (event_id, created_at DESC);

-- One append-only row per change request outcome (Approved, Denied, Withdrawn, Closed). Updates are
-- blocked by a trigger (003_functions_triggers.sql). Known limit: entries are not delete-protected.
-- The application has no route or query that deletes events, change requests or audit entries (events
-- are cancelled, never deleted), but a direct database DELETE of an event or change request removes
-- its audit entries through ON DELETE CASCADE, and a direct DELETE on this table is not blocked. Kept
-- so test and maintenance clean-up of events still works.
CREATE TABLE IF NOT EXISTS event_change_request_audit (
    id uuid PRIMARY KEY,
    change_request_id uuid NOT NULL REFERENCES event_change_requests (id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    outcome text NOT NULL CHECK (outcome IN ('Approved', 'Denied', 'Withdrawn', 'Closed')),
    changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array'),
    requested_by_id text NOT NULL,
    requested_by text NOT NULL,
    decided_by_id text,
    decided_by text NOT NULL,
    reason text,
    decided_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_change_request_audit_event_idx
    ON event_change_request_audit (event_id, decided_at DESC);
-- One outcome per request: a request is decided once.
CREATE UNIQUE INDEX IF NOT EXISTS event_change_request_audit_one_outcome
    ON event_change_request_audit (change_request_id);

-- One row per organiser cancellation request. A request never changes the event: the assigned
-- Coordinator accepts it (the cancellation runs in the same transaction) or declines it. Earlier
-- requests stay as history. `status` is the stored state only: a pending request whose event is later
-- Completed or Cancelled still reads 'pending' here and is shown as Closed by the API (derived on read,
-- never written). At most one request per event can be pending: `pending_key` holds the event id while
-- the request is pending and NULL afterwards, and the unique index on it settles concurrent submissions.
CREATE TABLE IF NOT EXISTS event_cancellation_requests (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    requested_by_id text NOT NULL,
    requested_by text NOT NULL,
    reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    requested_at timestamptz NOT NULL,
    decided_by_id text,
    decided_by text,
    decided_at timestamptz,
    pending_key uuid GENERATED ALWAYS AS (CASE WHEN status = 'pending' THEN event_id END) STORED,
    CONSTRAINT event_cancellation_requests_decision_check CHECK (
        (status = 'pending' AND decided_at IS NULL AND decided_by_id IS NULL AND decided_by IS NULL)
        OR (status <> 'pending' AND decided_at IS NOT NULL AND decided_by_id IS NOT NULL AND decided_by IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS event_cancellation_requests_one_pending
    ON event_cancellation_requests (pending_key);
CREATE INDEX IF NOT EXISTS event_cancellation_requests_event_requested_idx
    ON event_cancellation_requests (event_id, requested_at DESC);

-- The completion record of a Completed event: one row per event (saved by the assigned Coordinator, last
-- write wins). Saving it never changes the event status or the status history. Issues are a child table,
-- replaced as a whole on each save that carries `issues`; positions run 1 to 50, so the database bounds
-- an event to MAX_ISSUES issues as well as the application.
CREATE TABLE IF NOT EXISTS completion_records (
    event_id uuid PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
    attendance_count integer CHECK (attendance_count >= 0),
    operational_notes text CHECK (char_length(operational_notes) <= 2000),
    updated_by text NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS completion_record_issues (
    event_id uuid NOT NULL REFERENCES completion_records (event_id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position BETWEEN 1 AND 50),
    description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
    PRIMARY KEY (event_id, position)
);

-- Append-only history of venue unavailable periods. One 'created' entry is written when Venue Staff save
-- a period and one 'ended_early' entry when they end it early, each with the period, its reason, the Venue
-- Staff member who made the change (actor_user_id) and the time of the change (created_at). The
-- application only ever inserts into this table; nothing updates or deletes its rows.
-- The Coordinator notices about a venue change link to the affected booking through
-- notifications.related_booking_id.
CREATE TABLE IF NOT EXISTS venue_unavailability_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    -- The venue_bookings row (status 'blocked') the entry is about. No foreign key, so the history outlives it.
    period_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('created', 'ended_early')),
    start_at timestamptz NOT NULL,
    -- For 'created' the saved end; for 'ended_early' the new (earlier) end.
    end_at timestamptz NOT NULL,
    -- Only for 'ended_early': the end the period had before it was ended early.
    previous_end_at timestamptz,
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
    -- NULL only for periods created without a recorded actor (shown as "Not recorded").
    actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > start_at),
    CONSTRAINT venue_unavailability_history_previous_end_check CHECK (
        (action = 'created' AND previous_end_at IS NULL)
        OR (action = 'ended_early' AND previous_end_at IS NOT NULL AND previous_end_at > end_at)
    )
);
CREATE INDEX IF NOT EXISTS venue_unavailability_history_venue_idx
    ON venue_unavailability_history (venue_id, created_at DESC, id);

-- The append-only record of changes to an event and to its venue bookings, equipment requests and
-- registrations that no other table keeps a history of. It is written by the triggers in
-- 003_functions_triggers.sql, so every path that changes those rows is recorded without calling a
-- helper. Read together with the histories other tables already keep (read live, never copied here):
-- event_flagged_changes, event_change_requests, event_change_request_audit, event_cancellation_requests.
--
-- Who made a change: the backend sets the transaction-local setting app.actor_id to the signed-in
-- user's id (backend/src/database/database.service.ts). A change made by another trigger
-- (pg_trigger_depth() > 1) or by a rule that is automatic by definition (waiting list promotion and
-- removal, safety check reset) is recorded as made by the system. actor_name keeps the person's
-- display name as it was at the time. Entries loaded from earlier records carry actor_kind
-- 'unrecorded' when the earlier record did not keep who made the change.
CREATE TABLE IF NOT EXISTS event_audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- No foreign key on purpose: a foreign key makes every recorded change take a key-share lock on the
    -- event row, which would block other requests' SELECT ... FOR UPDATE on the event until commit
    -- (found by the SPM-120 withdrawal race test). events_audit_cleanup removes an event's entries
    -- when the event itself is deleted.
    event_id uuid NOT NULL,
    section text NOT NULL CHECK (section IN ('event', 'venue_booking', 'equipment', 'registration')),
    action text NOT NULL CHECK (length(btrim(action)) > 0),
    subject_id uuid,
    subject_label text,
    changes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(changes) = 'array'),
    reason text,
    actor_id text,
    actor_name text,
    actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'system', 'unrecorded')),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT event_audit_log_actor_check CHECK (
        (actor_kind = 'user' AND actor_name IS NOT NULL)
        OR (actor_kind <> 'user' AND actor_id IS NULL AND actor_name IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS event_audit_log_event_idx ON event_audit_log (event_id, occurred_at, id);

-- Event draft storage. Separate draft storage keeps submitted-event constraints intact.
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
