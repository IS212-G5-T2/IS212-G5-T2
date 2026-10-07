-- Apply to existing PostgreSQL volumes before running the SPM-50 venue API.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS accessibility_features (
    id varchar(50) PRIMARY KEY,
    label varchar(100) NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true
);

INSERT INTO accessibility_features (id, label) VALUES
    ('wheelchair-access', 'Wheelchair access'),
    ('accessible-restrooms', 'Accessible restrooms'),
    ('hearing-loop', 'Hearing loop'),
    ('elevator-access', 'Elevator access')
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, is_active = true;

CREATE TABLE IF NOT EXISTS facilities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
    description varchar(500),
    category varchar(100) NOT NULL CHECK (length(btrim(category)) > 0),
    is_active boolean NOT NULL DEFAULT true
);

INSERT INTO facilities (name, category) VALUES
    ('Catering', 'Amenities'),
    ('AV System', 'Audio and video'),
    ('Parking', 'Amenities'),
    ('Stage', 'Room features'),
    ('Projector', 'Presentation'),
    ('Whiteboard', 'Presentation'),
    ('Wi-Fi', 'Connectivity'),
    ('Wired network', 'Connectivity'),
    ('Video conferencing', 'Audio and video'),
    ('Lectern', 'Room features'),
    ('Power outlets', 'Room features')
ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category, is_active = true;

CREATE TABLE IF NOT EXISTS room_layouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
    description varchar(500),
    is_active boolean NOT NULL DEFAULT true
);

INSERT INTO room_layouts (name) VALUES
    ('Theatre'),
    ('Classroom'),
    ('Seminar Room'),
    ('Banquet'),
    ('Boardroom'),
    ('U-shape'),
    ('Standing'),
    ('Cabaret'),
    ('Hollow square')
ON CONFLICT (name) DO UPDATE SET is_active = true;

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

-- Upgrade an earlier local development copy that accepted staff-entered text IDs.
-- Existing text IDs are mapped deterministically so related rows keep their links.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venues'
          AND column_name = 'id'
          AND data_type <> 'uuid'
    ) THEN
        IF to_regclass('public.venue_accessibility') IS NOT NULL THEN
            ALTER TABLE venue_accessibility
                DROP CONSTRAINT IF EXISTS venue_accessibility_venue_id_fkey;
        END IF;

        ALTER TABLE venues
            ALTER COLUMN id TYPE uuid USING (
                CASE
                    WHEN id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        THEN id::uuid
                    ELSE (
                        substr(md5(id), 1, 8) || '-' ||
                        substr(md5(id), 9, 4) || '-4' ||
                        substr(md5(id), 14, 3) || '-8' ||
                        substr(md5(id), 18, 3) || '-' ||
                        substr(md5(id), 21, 12)
                    )::uuid
                END
            ),
            ALTER COLUMN id SET DEFAULT gen_random_uuid();

        IF to_regclass('public.venue_accessibility') IS NOT NULL THEN
            ALTER TABLE venue_accessibility
                ALTER COLUMN venue_id TYPE uuid USING (
                    CASE
                        WHEN venue_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                            THEN venue_id::uuid
                        ELSE (
                            substr(md5(venue_id), 1, 8) || '-' ||
                            substr(md5(venue_id), 9, 4) || '-4' ||
                            substr(md5(venue_id), 14, 3) || '-8' ||
                            substr(md5(venue_id), 18, 3) || '-' ||
                            substr(md5(venue_id), 21, 12)
                        )::uuid
                    END
                ),
                ADD CONSTRAINT venue_accessibility_venue_id_fkey
                    FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- Also upgrades a local database that received an earlier development version
-- of this uncommitted migration before duration fields were added.
ALTER TABLE venues
    ADD COLUMN IF NOT EXISTS setup_time_minutes integer NOT NULL DEFAULT 0
        CHECK (setup_time_minutes >= 0),
    ADD COLUMN IF NOT EXISTS turnaround_time_minutes integer NOT NULL DEFAULT 0
        CHECK (turnaround_time_minutes >= 0);
ALTER TABLE venues
    ALTER COLUMN setup_time_minutes DROP DEFAULT,
    ALTER COLUMN turnaround_time_minutes DROP DEFAULT;

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

-- Preserve values from the earlier array-based development schema, then
-- remove the duplicated columns once their relationships are materialized.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'venues'
          AND column_name = 'facilities'
    ) THEN
        EXECUTE $sql$
            INSERT INTO facilities (name, category)
            SELECT DISTINCT btrim(item), 'Legacy'
            FROM venues CROSS JOIN LATERAL unnest(facilities) AS item
            WHERE btrim(item) <> ''
            ON CONFLICT (name) DO NOTHING
        $sql$;
        EXECUTE $sql$
            INSERT INTO venue_facilities (venue_id, facility_id)
            SELECT v.id, f.id
            FROM venues v
            CROSS JOIN LATERAL unnest(v.facilities) AS item
            JOIN facilities f ON f.name = btrim(item)
            ON CONFLICT DO NOTHING
        $sql$;
        ALTER TABLE venues DROP COLUMN facilities;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'venues'
          AND column_name = 'layouts'
    ) THEN
        EXECUTE $sql$
            INSERT INTO room_layouts (name)
            SELECT DISTINCT btrim(item)
            FROM venues CROSS JOIN LATERAL unnest(layouts) AS item
            WHERE btrim(item) <> ''
            ON CONFLICT (name) DO NOTHING
        $sql$;
        EXECUTE $sql$
            INSERT INTO venue_layouts (venue_id, layout_id)
            SELECT v.id, rl.id
            FROM venues v
            CROSS JOIN LATERAL unnest(v.layouts) AS item
            JOIN room_layouts rl ON rl.name = btrim(item)
            ON CONFLICT DO NOTHING
        $sql$;
        ALTER TABLE venues DROP COLUMN layouts;
    END IF;
END $$;
