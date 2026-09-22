-- Local PostgreSQL authentication foundation. 001_rbac.sql runs first so the
-- role-assignment table below can reference the seeded RBAC role table.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
    display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
    password_hash text NOT NULL CHECK (length(password_hash) > 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_active_email_idx
    ON users (email)
    WHERE is_active = true;

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
    ON auth_sessions (token_hash, expires_at)
    WHERE revoked_at IS NULL;

-- These addresses and password are intentionally local-only. The password is
-- documented for development and is not a production credential or secret.
INSERT INTO users (email, display_name, password_hash)
VALUES
    ('organiser1@connectsphere.test', 'Organiser 1', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('organiser2@connectsphere.test', 'Organiser 2', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('organiser3@connectsphere.test', 'Organiser 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('coordinator1@connectsphere.test', 'Coordinator 1', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('coordinator2@connectsphere.test', 'Coordinator 2', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('coordinator3@connectsphere.test', 'Coordinator 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('venue_staff1@connectsphere.test', 'Venue Staff 1', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('venue_staff2@connectsphere.test', 'Venue Staff 2', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('venue_staff3@connectsphere.test', 'Venue Staff 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('tech_support1@connectsphere.test', 'Tech Support 1', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('tech_support2@connectsphere.test', 'Tech Support 2', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('tech_support3@connectsphere.test', 'Tech Support 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('attendee1@connectsphere.test', 'Attendee 1', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('attendee2@connectsphere.test', 'Attendee 2', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('attendee3@connectsphere.test', 'Attendee 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('organiser_coordinator@connectsphere.test', 'Org_Coor', crypt('P@55w0rd', gen_salt('bf', 12)))
ON CONFLICT (email) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        is_active = true,
        updated_at = now();

INSERT INTO user_roles (user_id, role_id)
SELECT users.id, roles.id
FROM (
    VALUES
        ('organiser1@connectsphere.test', 'ORGANISER'),
        ('organiser2@connectsphere.test', 'ORGANISER'),
        ('organiser3@connectsphere.test', 'ORGANISER'),
        ('coordinator1@connectsphere.test', 'COORDINATOR'),
        ('coordinator2@connectsphere.test', 'COORDINATOR'),
        ('coordinator3@connectsphere.test', 'COORDINATOR'),
        ('venue_staff1@connectsphere.test', 'VENUE_STAFF'),
        ('venue_staff2@connectsphere.test', 'VENUE_STAFF'),
        ('venue_staff3@connectsphere.test', 'VENUE_STAFF'),
        ('tech_support1@connectsphere.test', 'TECH_SUPPORT'),
        ('tech_support2@connectsphere.test', 'TECH_SUPPORT'),
        ('tech_support3@connectsphere.test', 'TECH_SUPPORT'),
        ('attendee1@connectsphere.test', 'ATTENDEE'),
        ('attendee2@connectsphere.test', 'ATTENDEE'),
        ('attendee3@connectsphere.test', 'ATTENDEE'),
        ('organiser_coordinator@connectsphere.test', 'ORGANISER'),
        ('organiser_coordinator@connectsphere.test', 'COORDINATOR')
) AS assignments(email, role_name)
JOIN users ON users.email = assignments.email
JOIN roles ON roles.name = assignments.role_name
ON CONFLICT (user_id, role_id) DO NOTHING;
