-- Live-demo seed: realistic, fictional campus data that shows every role's workflow.
--
-- DESTRUCTIVE. Empties events, venues, equipment and all user accounts, then reseeds
-- them. Roles, permissions and the lookup catalogues (facilities, room layouts,
-- accessibility features) are kept. Run it against the local demo database only.
-- This file lives outside init/, so fresh volumes and test databases never run it.
--
-- Dates are relative to the Singapore day the script runs. Re-run it shortly before a
-- demo so the past, upcoming and registration-open states stay correct.
-- Every account uses the password P@55w0rd.
--
-- Run:
--   docker compose -f docker-compose/docker-compose.yml exec -T postgres \
--     psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < database/postgresql/demo/demo_seed.sql

BEGIN;

TRUNCATE TABLE users, venues, events, equipment CASCADE;
-- event_drafts is named explicitly: organiser_id is plain text with no foreign key, so a
-- draft is only removed by the cascade above through its event_id reference. Listing it
-- keeps the reseed from leaving a draft that points at a deleted account.
TRUNCATE TABLE event_drafts;
-- event_audit_log has no foreign key to events (SPM-157: it outlives the rows it describes), so the
-- cascade above never reaches it. Without this, every reseed leaves the previous dataset's history
-- behind: a fresh Compose volume was carrying 80 rows for events that no longer existed, and the
-- count grew with each run. The history page is per-event so those rows were unreachable, but they
-- are still the deleted dataset's data. Triggers refill this for the rows seeded below.
TRUNCATE TABLE event_audit_log;

-- ---------------------------------------------------------------------------
-- Session-local helpers (pg_temp vanishes when the connection closes)
-- ---------------------------------------------------------------------------

-- A timestamptz at a Singapore wall-clock hour, p_day days from today.
CREATE OR REPLACE FUNCTION pg_temp.demo_at(p_day integer, p_hour numeric)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Singapore')
          + make_interval(days => p_day)
          + make_interval(mins => round(p_hour * 60)::integer)) AT TIME ZONE 'Asia/Singapore'
$$;

CREATE OR REPLACE FUNCTION pg_temp.demo_email(p_local text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT p_local || '@connectsphere.sg'
$$;

CREATE OR REPLACE FUNCTION pg_temp.demo_uid(p_local text)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM users WHERE email = pg_temp.demo_email(p_local)
$$;

CREATE OR REPLACE FUNCTION pg_temp.demo_event_id(p_key integer)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-4000-8000-0000000d' || lpad(p_key::text, 4, '0'))::uuid
$$;

CREATE OR REPLACE FUNCTION pg_temp.demo_venue_id(p_key integer)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-4000-8000-0000000c' || lpad(p_key::text, 4, '0'))::uuid
$$;

-- ---------------------------------------------------------------------------
-- Accounts and roles
-- ---------------------------------------------------------------------------

INSERT INTO users (email, display_name, password_hash)
SELECT v.email, v.display_name, crypt('P@55w0rd', gen_salt('bf', 12))
FROM (VALUES
    ('org@connectsphere.sg', 'Priya Nair'),
    ('coord1@connectsphere.sg', 'Daniel Lim'),
    ('coord2@connectsphere.sg', 'Aisha Rahman'),
    ('coord_vs@connectsphere.sg', 'Marcus Tan'),
    ('vs@connectsphere.sg', 'Hafiz Ismail'),
    ('ts@connectsphere.sg', 'Kevin Ong'),
    ('lead@connectsphere.sg', 'Grace Chong'),
    ('so@connectsphere.sg', 'Dr Rachel Goh'),
    ('att1@connectsphere.sg', 'Wei Jie Koh'),
    ('att2@connectsphere.sg', 'Nur Aisyah Yusof'),
    ('att3@connectsphere.sg', 'Ravi Kumar'),
    ('att4@connectsphere.sg', 'Mei Ling Tay'),
    ('att5@connectsphere.sg', 'Joshua Ng')
) AS v(email, display_name);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM (VALUES
    ('org', 'ORGANISER'),
    ('coord1', 'COORDINATOR'),
    ('coord2', 'COORDINATOR'),
    ('coord_vs', 'COORDINATOR'),
    ('coord_vs', 'VENUE_STAFF'),
    ('vs', 'VENUE_STAFF'),
    ('ts', 'TECH_SUPPORT'),
    ('lead', 'COORDINATOR_LEAD'),
    ('so', 'SAFETY_OFFICER'),
    ('att1', 'ATTENDEE'),
    ('att2', 'ATTENDEE'),
    ('att3', 'ATTENDEE'),
    ('att4', 'ATTENDEE'),
    ('att5', 'ATTENDEE')
) AS a(login, role_name)
JOIN users u ON u.email = pg_temp.demo_email(a.login)
JOIN roles r ON r.name = a.role_name;

-- ---------------------------------------------------------------------------
-- Venues (owned by venue staff; facilities, layouts and accessibility use the catalogues)
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE demo_venue (
    key integer PRIMARY KEY,
    name text NOT NULL,
    location text NOT NULL,
    capacity integer NOT NULL,
    operating_information text NOT NULL,
    setup_minutes integer NOT NULL,
    turnaround_minutes integer NOT NULL,
    owner_login text NOT NULL,
    facilities text[] NOT NULL,
    layouts text[] NOT NULL,
    accessibility text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_venue VALUES
    (1, 'Main Auditorium', 'Block A, Level 1', 400, 'Open Mon to Sat, 8am to 10pm. AV technician on call.', 60, 45, 'vs',
        ARRAY['AV System', 'Stage', 'Lectern', 'Wi-Fi', 'Power outlets'], ARRAY['Theatre', 'Standing'], ARRAY['Wheelchair access', 'Hearing loop', 'Elevator access']),
    (2, 'Lecture Theatre 1', 'Block B, Level 2', 250, 'Open weekdays, 8am to 9pm.', 30, 30, 'vs',
        ARRAY['AV System', 'Projector', 'Lectern', 'Whiteboard'], ARRAY['Theatre', 'Classroom'], ARRAY['Wheelchair access', 'Hearing loop']),
    (3, 'Community Hall', 'Community Centre, Level 1', 200, 'Open daily, 9am to 10pm. Caterers use the loading bay.', 30, 30, 'vs',
        ARRAY['Catering', 'Power outlets', 'Parking', 'Wi-Fi'], ARRAY['Banquet', 'Standing', 'Cabaret'], ARRAY['Wheelchair access', 'Accessible restrooms']),
    (4, 'Sports Hall', 'Sports Complex, Level 2', 300, 'Open daily, 7am to 10pm. Floor protection required.', 30, 30, 'vs',
        ARRAY['Wi-Fi', 'Power outlets', 'Parking'], ARRAY['Standing'], ARRAY['Accessible restrooms', 'Elevator access']),
    (5, 'Level 3 Seminar Room', 'Block B, Level 3', 60, 'Open weekdays, 8am to 8pm.', 15, 15, 'coord_vs',
        ARRAY['Projector', 'Whiteboard', 'Video conferencing', 'Wi-Fi'], ARRAY['Seminar Room', 'Classroom'], ARRAY['Hearing loop']),
    (6, 'Creative Studio', 'Arts Block, Level 2', 40, 'Open weekdays, 9am to 9pm. Users clean up after sessions.', 15, 20, 'coord_vs',
        ARRAY['Power outlets', 'Whiteboard', 'Wi-Fi'], ARRAY['Classroom', 'Seminar Room'], ARRAY['Wheelchair access']),
    (7, 'Boardroom 4', 'Admin Building, Level 4', 16, 'Open weekdays, 8am to 6pm.', 10, 10, 'vs',
        ARRAY['Video conferencing', 'Wi-Fi', 'Whiteboard'], ARRAY['Boardroom'], ARRAY['Wheelchair access', 'Elevator access']),
    (8, 'Rooftop Garden Terrace', 'Admin Building, Rooftop', 120, 'Outdoor space. Open 5pm to 10pm, weather dependent.', 60, 60, 'coord_vs',
        ARRAY['Power outlets', 'Parking'], ARRAY['Standing', 'Cabaret'], ARRAY['Accessible restrooms']),
    (9, 'Learning Hub Atrium', 'Library, Level 1', 150, 'Open daily, 10am to 9pm.', 30, 30, 'vs',
        ARRAY['Wi-Fi', 'Power outlets', 'Catering', 'Stage'], ARRAY['Standing', 'Cabaret', 'Theatre'], ARRAY['Wheelchair access', 'Elevator access']),
    (10, 'Innovation Lab', 'Engineering Block, Level 5', 80, 'Open weekdays, 9am to 7pm. Lab safety induction required.', 20, 20, 'coord_vs',
        ARRAY['Power outlets', 'Wi-Fi', 'Whiteboard', 'AV System'], ARRAY['U-shape', 'Standing'], ARRAY['Wheelchair access']);

INSERT INTO venues (id, owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
SELECT pg_temp.demo_venue_id(v.key), u.id, v.name, v.location, v.capacity, v.operating_information, v.setup_minutes, v.turnaround_minutes
FROM demo_venue v
JOIN users u ON u.email = pg_temp.demo_email(v.owner_login);

INSERT INTO venue_facilities (venue_id, facility_id)
SELECT pg_temp.demo_venue_id(v.key), f.id
FROM demo_venue v
JOIN facilities f ON f.name = ANY (v.facilities);

INSERT INTO venue_layouts (venue_id, layout_id)
SELECT pg_temp.demo_venue_id(v.key), rl.id
FROM demo_venue v
JOIN room_layouts rl ON rl.name = ANY (v.layouts);

INSERT INTO venue_accessibility (venue_id, accessibility_id)
SELECT pg_temp.demo_venue_id(v.key), af.id
FROM demo_venue v
JOIN accessibility_features af ON af.label = ANY (v.accessibility);

-- ---------------------------------------------------------------------------
-- Venue images (three venues only). Tiny solid-colour PNGs, so the file stays small.
-- byte_size is the decoded size of the PNG, which is how the venue API stores it.
-- ---------------------------------------------------------------------------

INSERT INTO venue_images (venue_id, file_name, mime_type, byte_size, data_url)
SELECT pg_temp.demo_venue_id(i.vk), i.file_name, 'image/png',
    octet_length(decode(i.png_base64, 'base64')),
    'data:image/png;base64,' || i.png_base64
FROM (VALUES
    (1, 'main-auditorium.png', 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAAaUlEQVR42u3QMQ0AAAgDsInCBI6QjwNujiZV0FQPhygQJEiQIEGCBAlCkCBBggQJEiQIQYIECRIkSJAgBAkSJEiQIEGCBCFIkCBBggQJEoQgQYIECRIkSBCCBAkSJEiQIEGCECRIkKB/Fojn+UuxTZ2vAAAAAElFTkSuQmCC'),
    (3, 'community-hall.png', 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAAaUlEQVR42u3QMQ0AAAgDsAlDGAIRhgNujiZV0EwXhygQJEiQIEGCBAlCkCBBggQJEiQIQYIECRIkSJAgBAkSJEiQIEGCBCFIkCBBggQJEoQgQYIECRIkSBCCBAkSJEiQIEGCECRIkKB/FqpxQg76PaksAAAAAElFTkSuQmCC'),
    (8, 'rooftop-garden-terrace.png', 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAAaUlEQVR42u3QMQ0AAAgDsKlDCXIQjQNujiZV0NQ0hygQJEiQIEGCBAlCkCBBggQJEiQIQYIECRIkSJAgBAkSJEiQIEGCBCFIkCBBggQJEoQgQYIECRIkSBCCBAkSJEiQIEGCECRIkKB/Fv/kEbRoIibDAAAAAElFTkSuQmCC')
) AS i(vk, file_name, png_base64);

-- ---------------------------------------------------------------------------
-- Equipment and its audit trail
-- ---------------------------------------------------------------------------

INSERT INTO equipment (equipment_name, equipment_type, quantity, maintenance_status, active_quantity, under_maintenance_quantity, retired_quantity, location, is_available) VALUES
    ('Wireless Microphone', 'Audio', 12, 'Active', 10, 2, 0, 'AV Store, Block A', true),
    ('Lapel Microphone', 'Audio', 6, 'Active', 6, 0, 0, 'AV Store, Block A', true),
    ('Portable PA Speaker', 'Audio', 8, 'Active', 7, 1, 0, 'AV Store, Block A', true),
    ('Projector 4K', 'Visual', 6, 'Active', 6, 0, 0, 'AV Store, Block A', true),
    ('Portable Projector Screen', 'Visual', 5, 'Active', 5, 0, 0, 'AV Store, Block A', true),
    ('Video Conferencing Camera', 'Visual', 3, 'Under Maintenance', 0, 3, 0, 'IT Store, Block B', false),
    ('Laptop Loan Set', 'Visual', 10, 'Active', 10, 0, 0, 'Library Service Desk', true),
    ('Stage Lighting Par Can', 'Lighting', 16, 'Active', 16, 0, 0, 'Theatre Store, Block A', true),
    ('LED Light Panel', 'Lighting', 12, 'Active', 9, 3, 0, 'Theatre Store, Block A', true),
    ('Round Banquet Table', 'Furniture', 40, 'Active', 40, 0, 0, 'Events Warehouse', true),
    ('Stackable Chair', 'Furniture', 300, 'Active', 300, 0, 0, 'Events Warehouse', true),
    ('Lectern', 'Furniture', 4, 'Active', 4, 0, 0, 'AV Store, Block A', true),
    ('Extension Cable 6-Way', 'Other', 25, 'Active', 25, 0, 0, 'Facilities Office', true),
    ('Smoke Machine', 'Other', 1, 'Retired', 0, 0, 1, 'Theatre Store, Block A', false);

INSERT INTO equipment_audit_trail (equipment_id, equipment_name, equipment_type, location, maintenance_status, quantity,
    active_quantity, under_maintenance_quantity, retired_quantity, is_available, change_type, reason, changed_by, changed_at)
SELECT e.id, e.equipment_name, e.equipment_type, e.location, e.maintenance_status, e.quantity,
    e.active_quantity, e.under_maintenance_quantity, e.retired_quantity, e.is_available,
    a.change_type, a.reason, 'Kevin Ong', a.changed_at
FROM equipment e
JOIN (VALUES
    ('Video Conferencing Camera', 'Marked unavailable', 'Lens fault. Sent to the supplier for repair.', now() - interval '4 days'),
    ('LED Light Panel', 'Equipment record updated', 'Quantities updated after the stocktake.', now() - interval '6 days'),
    ('Smoke Machine', 'Equipment record updated', 'Retired after a fuse failure.', now() - interval '40 days')
) AS a(equipment_name, change_type, reason, changed_at) ON a.equipment_name = e.equipment_name;

-- ---------------------------------------------------------------------------
-- Event plan: one row per event. Everything else for an event is keyed off this table.
-- path is the status trail the event has walked, ending at its current status.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE demo_plan (
    key integer PRIMARY KEY,
    event_name text NOT NULL,
    purpose text NOT NULL,
    description text NOT NULL,
    day integer NOT NULL,
    start_hour numeric NOT NULL,
    duration_hours numeric NOT NULL,
    attendance integer NOT NULL,
    layout text NOT NULL,
    facilities text[] NOT NULL,
    accessibility text[] NOT NULL,
    equipment_needs text NOT NULL,
    reg_enabled boolean NOT NULL,
    reg_limit integer NOT NULL,
    reg_close_hours numeric NOT NULL,
    status text NOT NULL,
    coord text,
    rejection_reason text,
    path text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_plan VALUES
    -- Submitted, not yet assigned (Lead assignment queue)
    (1, 'Freshmen Orientation Mixer', 'Welcome first-year students to campus life', 'Speed networking, a guided campus walk and a casual dinner for first-year students.', 9, 17, 3, 180, 'Banquet', ARRAY['Catering', 'AV System'], ARRAY['Wheelchair access'], 'Two portable speakers and one wireless microphone.', false, 1, 1, 'Submitted', NULL, NULL, ARRAY['Submitted']),
    (2, 'Sustainability Film Night', 'Raise awareness of climate action', 'Screening of a short documentary, followed by a moderated panel discussion.', 12, 19, 2.5, 120, 'Theatre', ARRAY['Projector', 'AV System'], ARRAY['Hearing loop'], 'Screen and surround sound system.', false, 1, 1, 'Submitted', NULL, NULL, ARRAY['Submitted']),
    (3, 'Community First Aid Workshop', 'Basic life support training for volunteers', 'Hands-on CPR and first-aid training led by certified trainers.', 16, 9, 4, 40, 'Classroom', ARRAY['Whiteboard', 'Projector'], ARRAY[]::text[], 'Training manikins supplied by the organiser.', false, 1, 1, 'Submitted', NULL, NULL, ARRAY['Submitted']),
    (4, 'Inter-Hall Table Tennis Tournament', 'Promote student wellbeing', 'Knockout tournament across all halls, with spectator seating.', 22, 9, 8, 96, 'Standing', ARRAY['Wi-Fi'], ARRAY['Accessible restrooms'], 'Tournament tables and scoring boards.', false, 1, 1, 'Submitted', NULL, NULL, ARRAY['Submitted']),
    (5, 'Startup Pitch Showcase', 'Connect student founders with investors', 'Ten teams pitch for five minutes each, followed by networking.', 30, 13, 4, 150, 'Theatre', ARRAY['Stage', 'AV System'], ARRAY['Elevator access'], 'Stage monitors and two handheld microphones.', false, 1, 1, 'Submitted', NULL, NULL, ARRAY['Submitted']),
    -- Submitted, assigned to a coordinator (6 and 7 to Daniel, 8 and 9 to Aisha)
    (6, 'Heritage Photography Exhibition', 'Celebrate local heritage', 'A week of archival photographs displayed across the atrium.', 7, 10, 9, 200, 'Standing', ARRAY['Power outlets'], ARRAY['Wheelchair access'], 'Display panels and picture-hanging rails.', false, 1, 1, 'Submitted', 'coord1', NULL, ARRAY['Submitted']),
    (7, 'Mental Wellbeing Talk Series', 'Support student mental health', 'A talk on managing exam stress, with a counsellor-led Q&A.', 19, 18, 2, 80, 'Seminar Room', ARRAY['Projector', 'Wi-Fi'], ARRAY['Hearing loop'], 'Clip-on microphone for the speaker.', false, 1, 1, 'Submitted', 'coord1', NULL, ARRAY['Submitted']),
    (8, 'Robotics Competition Finals', 'Showcase student robotics teams', 'Finals of the inter-school robot challenge, with live scoreboards.', 27, 9, 8, 220, 'Theatre', ARRAY['AV System', 'Power outlets'], ARRAY['Wheelchair access'], 'Two wireless microphones and a scoreboard screen.', false, 1, 1, 'Submitted', 'coord2', NULL, ARRAY['Submitted']),
    (9, 'Alumni Careers Panel', 'Connect students with alumni', 'Alumni share their career journeys in a moderated panel.', 36, 18, 3, 90, 'Cabaret', ARRAY['Catering', 'Wi-Fi'], ARRAY['Accessible restrooms'], 'Panel microphones and a lectern.', false, 1, 1, 'Submitted', 'coord2', NULL, ARRAY['Submitted']),
    -- Approved (no booking yet)
    (10, 'Choir Charity Concert', 'Raise funds for a community charity', 'An evening concert by the campus choirs, with a charity donation drive.', 13, 18, 3, 300, 'Theatre', ARRAY['AV System', 'Stage'], ARRAY['Wheelchair access', 'Hearing loop'], 'Choir risers and stage lighting.', false, 1, 1, 'Approved', 'coord1', NULL, ARRAY['Submitted', 'Approved']),
    (11, 'Schools Robotics Open House', 'Invite secondary school students to campus', 'Demonstrations and hands-on robotics stations for visiting students.', 24, 9, 6, 150, 'Classroom', ARRAY['Power outlets', 'Wi-Fi'], ARRAY['Elevator access'], 'Workbenches and extension cables.', false, 1, 1, 'Approved', 'coord2', NULL, ARRAY['Submitted', 'Approved']),
    (12, 'Teachers'' Wellness Forum', 'Support educator wellbeing', 'A half-day forum on workload and wellbeing for educators.', 41, 14, 3, 110, 'Seminar Room', ARRAY['Whiteboard', 'Wired network'], ARRAY[]::text[], 'Name tags and printed handouts.', false, 1, 1, 'Approved', 'coord_vs', NULL, ARRAY['Submitted', 'Approved']),
    (13, 'Engineering Design Expo', 'Showcase final-year design projects', 'Student teams exhibit prototypes to industry judges.', 58, 10, 5, 260, 'Standing', ARRAY['AV System', 'Power outlets'], ARRAY['Wheelchair access'], 'Exhibition tables and display screens.', false, 1, 1, 'Approved', 'coord1', NULL, ARRAY['Submitted', 'Approved']),
    (14, 'Community Jazz Night', 'Build community spirit', 'Evening performances by student jazz ensembles.', 62, 19, 2, 140, 'Cabaret', ARRAY['Catering', 'Stage'], ARRAY['Wheelchair access'], 'Stage monitors and a small PA system.', false, 1, 1, 'Approved', 'coord2', NULL, ARRAY['Submitted', 'Approved']),
    -- Rejected
    (15, 'Night Market Pop-Up', 'Student food and crafts market', 'Evening market with food stalls and craft booths.', 11, 17, 5, 500, 'Standing', ARRAY['Power outlets'], ARRAY[]::text[], '', false, 1, 1, 'Rejected', 'coord2', 'Expected attendance exceeds the capacity of every venue free on this date.', ARRAY['Submitted', 'Rejected']),
    (16, 'Overnight Hackathon', 'Build prototypes over one night', 'Teams build and pitch prototypes over a 12-hour overnight session.', 18, 18, 12, 120, 'Standing', ARRAY['Wi-Fi', 'Power outlets'], ARRAY[]::text[], 'Extra power strips and rest areas.', false, 1, 1, 'Rejected', 'coord1', 'Overnight events need a safety briefing that cannot be scheduled in time.', ARRAY['Submitted', 'Rejected']),
    (17, 'Ballroom Dance Social', 'Social dance night for students', 'Beginner-friendly dance lessons, followed by a social.', 26, 19, 3, 90, 'Banquet', ARRAY['Catering', 'AV System'], ARRAY['Wheelchair access'], 'Music system and dance floor mats.', false, 1, 1, 'Rejected', 'coord2', 'The requested venue is reserved for examinations during this period.', ARRAY['Submitted', 'Rejected']),
    (18, 'Outdoor Drone Demonstration', 'Showcase drone engineering', 'Demonstration flights for a small invited audience.', 40, 10, 3, 60, 'Standing', ARRAY[]::text[], ARRAY[]::text[], 'Safety cordon and flight log sheets.', false, 1, 1, 'Rejected', 'coord_vs', 'Drone flights on campus grounds need prior CAAS approval, which is not in place.', ARRAY['Submitted', 'Rejected']),
    -- Planning (venue, equipment and safety states differ across these rows)
    (19, 'Industry Leaders Roundtable', 'Connect faculty with industry', 'Closed-door roundtable with industry leaders and faculty heads.', 15, 9, 4, 60, 'Boardroom', ARRAY['Wi-Fi', 'Video conferencing'], ARRAY[]::text[], 'Name cards and a projector for slides.', false, 1, 1, 'Planning', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning']),
    (20, 'Research Symposium', 'Share faculty research', 'Paper presentations and a poster session across one day.', 21, 9, 8, 180, 'Theatre', ARRAY['AV System', 'Projector'], ARRAY['Wheelchair access', 'Hearing loop'], 'Poster boards and LED lighting for the poster hall.', false, 1, 1, 'Planning', 'coord2', NULL, ARRAY['Submitted', 'Approved', 'Planning']),
    (21, 'Founders Networking Dinner', 'Connect alumni founders with students', 'Seated dinner with short founder talks.', 29, 18, 3, 110, 'Banquet', ARRAY['Catering', 'AV System'], ARRAY['Wheelchair access'], 'Lapel microphone for each speaker.', false, 1, 1, 'Planning', 'coord_vs', NULL, ARRAY['Submitted', 'Approved', 'Planning']),
    (22, 'Campus Movie Night', 'Outdoor community screening', 'Open-air screening of a family film on the main lawn.', 38, 19, 3, 200, 'Standing', ARRAY['Projector', 'AV System'], ARRAY['Accessible restrooms'], 'Inflatable screen and outdoor speakers.', false, 1, 1, 'Planning', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning']),
    (23, 'Faculty Board Briefing', 'Governance briefing for faculty leaders', 'Briefing on the governance changes for the next academic year.', 46, 18, 4, 14, 'Boardroom', ARRAY['Wi-Fi', 'Video conferencing'], ARRAY[]::text[], 'Printed board packs.', false, 1, 1, 'Planning', 'coord2', NULL, ARRAY['Submitted', 'Approved', 'Planning']),
    (24, 'Rooftop Stargazing Evening', 'Astronomy night for students', 'Telescope viewing and a short talk on the night sky.', 52, 20, 2, 80, 'Standing', ARRAY['Power outlets'], ARRAY['Accessible restrooms'], 'Telescopes and red-light torches for each guide.', false, 1, 1, 'Planning', 'coord_vs', NULL, ARRAY['Submitted', 'Approved', 'Planning']),
    -- Confirmed, upcoming
    (25, 'Leadership Lecture Series: Sustainable Cities', 'Speaker series on urban sustainability', 'A keynote and panel on sustainable urban design. Registration is capped at 3 to show a waitlist.', 14, 18, 2, 200, 'Theatre', ARRAY['AV System', 'Stage'], ARRAY['Wheelchair access', 'Hearing loop'], 'Two wireless microphones and a PA system.', true, 3, 1, 'Confirmed', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    (26, 'Community Health Fair', 'Free health screenings for residents', 'Blood pressure checks, dental advice and health talks.', 20, 18, 3, 150, 'Standing', ARRAY['Power outlets', 'Wi-Fi'], ARRAY['Wheelchair access', 'Accessible restrooms'], 'Screening stations and a PA system.', false, 1, 1, 'Planning', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning']),
    (27, 'Annual Science Open Day', 'Showcase campus science', 'Lab tours, demonstrations and public talks for families.', 45, 10, 6, 320, 'Theatre', ARRAY['AV System', 'Stage'], ARRAY['Wheelchair access', 'Elevator access'], 'Lab demonstration equipment and two lapel microphones.', true, 5, 1, 'Confirmed', 'coord_vs', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    (28, 'Student Leadership Retreat', 'Develop student leaders', 'Team-building and leadership workshops over one day. Registration opens later.', 60, 9, 8, 45, 'Seminar Room', ARRAY['Whiteboard', 'Wi-Fi'], ARRAY[]::text[], 'Breakout tables and flip charts.', true, 60, 1, 'Confirmed', 'coord2', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    (29, 'Creative Writing Showcase', 'Celebrate student writing', 'Readings by student authors, followed by a book signing. Registration has closed.', 5, 14, 3, 35, 'Seminar Room', ARRAY['Lectern', 'Power outlets'], ARRAY['Hearing loop'], 'Lectern and a clip-on microphone.', true, 40, 240, 'Confirmed', 'coord_vs', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    (30, 'Data Analytics Bootcamp', 'Hands-on data skills', 'A full-day bootcamp on dashboards and data cleaning.', 25, 9, 6, 50, 'Classroom', ARRAY['Projector', 'Wi-Fi'], ARRAY[]::text[], 'Laptops are provided by the organiser.', true, 60, 1, 'Confirmed', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    (31, 'Innovation Lab Open House', 'Explore student prototypes', 'Guided tours of the Innovation Lab, with live demonstrations.', 35, 13, 4, 70, 'Standing', ARRAY['AV System', 'Power outlets'], ARRAY['Wheelchair access'], 'Two wireless microphones for the Q&A.', true, 80, 1, 'Confirmed', 'coord2', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    (32, 'Faculty Town Hall', 'Update staff on campus plans', 'Town hall with an update from the Dean, followed by Q&A.', 33, 14, 3, 380, 'Theatre', ARRAY['AV System', 'Stage'], ARRAY['Wheelchair access', 'Hearing loop'], 'Wireless microphones and stage screens.', true, 400, 1, 'Confirmed', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    (33, 'Wellness Yoga in the Park', 'Free yoga for students', 'Morning yoga session on the rooftop garden.', 28, 7, 1.5, 40, 'Standing', ARRAY[]::text[], ARRAY['Accessible restrooms'], 'Yoga mats and a portable speaker.', true, 30, 1, 'Confirmed', 'coord_vs', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    (34, 'Global Careers Fair', 'Connect students with employers', 'Booths from 40 employers and short talks through the day.', 65, 10, 8, 140, 'Standing', ARRAY['Catering', 'Wi-Fi'], ARRAY['Wheelchair access'], 'Booth power and banner stands.', true, 150, 1, 'Confirmed', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    -- Confirmed, end already passed (ready for Mark Completed)
    (35, 'Spring Photography Workshop', 'Hands-on photography basics', 'A morning workshop on composition and lighting.', -10, 14, 3, 30, 'Classroom', ARRAY['Projector', 'Whiteboard'], ARRAY[]::text[], 'Camera kits from the Creative Studio.', true, 35, 1, 'Confirmed', 'coord2', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    (36, 'Badminton Friendly Match', 'Inter-faculty sports', 'Friendly badminton matches with prizes.', -4, 17, 3, 120, 'Standing', ARRAY['Wi-Fi'], ARRAY['Accessible restrooms'], 'Court nets and shuttlecock supplies.', true, 150, 1, 'Confirmed', 'coord_vs', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    (37, 'Boardroom Governance Briefing', 'Compliance briefing for department heads', 'Briefing on the updated compliance rules.', -2, 9, 2, 12, 'Boardroom', ARRAY['Wi-Fi'], ARRAY[]::text[], '', true, 16, 1, 'Confirmed', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed']),
    -- Completed
    (38, 'Welcome Back Orientation', 'Orient returning students', 'Campus welcome, activity fair and a stage show.', -30, 9, 6, 400, 'Standing', ARRAY['Stage', 'AV System'], ARRAY['Wheelchair access'], 'Stage lighting and a PA system.', true, 500, 1, 'Completed', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed', 'Completed']),
    (39, 'Inter-School Debate Finals', 'Showcase debating skills', 'Finals of the inter-school debate league.', -27, 14, 4, 210, 'Theatre', ARRAY['AV System', 'Lectern'], ARRAY['Hearing loop'], 'Two lapel microphones and a timer display.', true, 250, 1, 'Completed', 'coord2', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed', 'Completed']),
    (40, 'Career Speed Mentoring', 'Pair students with mentors', 'Short one-to-one mentoring rounds.', -22, 18, 2.5, 90, 'Cabaret', ARRAY['Catering', 'Wi-Fi'], ARRAY['Wheelchair access'], 'Name tags and timer bells.', true, 100, 1, 'Completed', 'coord_vs', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed', 'Completed']),
    (41, 'Charity Run Briefing', 'Brief volunteers ahead of the run', 'Route briefing and marshal allocation for the charity run.', -18, 8, 2, 60, 'Standing', ARRAY['Whiteboard'], ARRAY[]::text[], 'Route maps and marshal vests.', true, 80, 1, 'Completed', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed', 'Completed']),
    (42, 'Teaching Excellence Seminar', 'Share good teaching practice', 'Faculty seminar on blended learning.', -12, 14, 3, 55, 'Seminar Room', ARRAY['Projector', 'Wi-Fi'], ARRAY[]::text[], 'Projector and clip-on microphone.', true, 60, 1, 'Completed', 'coord2', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed', 'Completed']),
    (43, 'Design Thinking Bootcamp', 'Hands-on innovation workshop', 'A two-day sprint for student innovators, run in one long session here.', -8, 9, 7, 45, 'U-shape', ARRAY['Power outlets', 'Wi-Fi'], ARRAY[]::text[], 'Sticky notes and whiteboards.', true, 50, 1, 'Completed', 'coord_vs', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed', 'Completed']),
    (44, 'Community Cook-off', 'Cook-off with neighbourhood cooks', 'Neighbourhood cooks compete in a public cook-off, judged by a panel.', -6, 17, 3, 75, 'Standing', ARRAY['Catering', 'Power outlets'], ARRAY['Wheelchair access'], 'Portable induction hobs and judging tables.', true, 120, 1, 'Completed', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed', 'Completed']),
    -- Cancelled
    (45, 'Rural Outreach Roadshow', 'Outreach to schools in the region', 'Campus roadshow visiting partner schools.', 26, 9, 6, 150, 'Standing', ARRAY[]::text[], ARRAY[]::text[], 'Display banners and a portable speaker.', false, 1, 1, 'Cancelled', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Cancelled']),
    (46, 'Summer Music Carnival', 'Campus music festival', 'Afternoon festival with student bands and food trucks.', 40, 16, 6, 350, 'Standing', ARRAY['Stage', 'AV System'], ARRAY['Wheelchair access'], 'Wireless microphones and a stage PA system.', false, 1, 1, 'Cancelled', 'coord2', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Cancelled']),
    (47, 'Alumni Gala Dinner', 'Annual alumni dinner', 'Formal dinner and awards night for alumni.', 48, 18, 4, 150, 'Banquet', ARRAY['Catering', 'Stage'], ARRAY['Wheelchair access', 'Elevator access'], 'Lectern and wireless microphones.', true, 150, 1, 'Cancelled', 'coord1', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Confirmed', 'Cancelled']),
    (48, 'Hackerspace Demo Night', 'Demo night for student makers', 'Makers show their projects and run live build sessions.', -15, 18, 3, 60, 'U-shape', ARRAY['Power outlets', 'Wi-Fi'], ARRAY[]::text[], 'Soldering stations and extension cables.', false, 1, 1, 'Cancelled', 'coord_vs', NULL, ARRAY['Submitted', 'Approved', 'Planning', 'Cancelled']);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
    start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, registration_opens_at, registration_closes_at, registration_limit,
    status, rejection_reason, coordinator_id, coordinator_name, submission_key, equipment_confirmed_at,
    cancelled_by, cancelled_at, created_at, updated_at)
SELECT pg_temp.demo_event_id(p.key), org.id::text, org.display_name, org.email,
    p.event_name, p.purpose, p.description,
    pg_temp.demo_at(p.day, p.start_hour), pg_temp.demo_at(p.day, p.start_hour + p.duration_hours),
    p.attendance, p.layout, p.facilities, p.accessibility,
    p.equipment_needs, p.reg_enabled,
    CASE WHEN p.reg_enabled THEN
        CASE WHEN p.key IN (27, 34, 47) THEN pg_temp.demo_at(-3, 9) ELSE pg_temp.demo_at(p.day - 21, 9) END
    END,
    CASE WHEN p.reg_enabled THEN pg_temp.demo_at(p.day, p.start_hour) - make_interval(mins => round(p.reg_close_hours * 60)::integer) END,
    p.reg_limit, p.status, p.rejection_reason,
    coord.id::text, coord.display_name, pg_temp.demo_event_id(p.key),
    CASE WHEN p.status IN ('Planning', 'Confirmed', 'Completed') AND p.key NOT IN (19, 20, 21, 22, 24) THEN pg_temp.demo_at(p.day - 7, 10) END,
    CASE WHEN p.status = 'Cancelled' THEN coord.display_name END,
    CASE WHEN p.status = 'Cancelled' THEN now() - interval '3 days' END,
    pg_temp.demo_at(p.day - 30, 10), now()
FROM demo_plan p
JOIN users org ON org.email = pg_temp.demo_email('org')
LEFT JOIN users coord ON coord.email = pg_temp.demo_email(p.coord);

-- ---------------------------------------------------------------------------
-- Organiser drafts (SPM-37): saved but never submitted, so "My Drafts" has rows to resume.
-- fields is read as the frontend's DraftFields, so the event name lives under 'name'
-- (not 'eventName'). The second draft is deliberately partial: it stops at step 1.
-- organiser_id is the user id as text, as for events.
-- ---------------------------------------------------------------------------

INSERT INTO event_drafts (id, organiser_id, fields, status, version, created_at, updated_at)
SELECT d.id::uuid, org.id::text,
    jsonb_build_object(
        'formStep', d.form_step,
        'name', d.event_name,
        'purpose', d.purpose,
        'description', d.description,
        'startDate', d.start_date,
        'startTime', d.start_time,
        'endDate', d.end_date,
        'endTime', d.end_time,
        'expectedAttendance', d.attendance,
        'layout', d.layout,
        'facilities', to_jsonb(d.facilities),
        'accessibility', to_jsonb(d.accessibility),
        'attachments', '[]'::jsonb,
        'equipmentNeeds', d.equipment_needs,
        'registrationEnabled', false
    ),
    'Draft', d.version, d.created_at, d.updated_at
FROM (VALUES
    ('00000000-0000-4000-8000-0000000e0001', 3, 'Green Campus Week Kickoff', 'Launch a week of sustainability activities',
        'Opening ceremony, a pledge wall and a short talk from the student sustainability council.',
        to_char(pg_temp.demo_at(40, 9) AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD'), '09:00',
        to_char(pg_temp.demo_at(40, 12) AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD'), '12:00',
        '120', 'Standing', ARRAY['Wi-Fi', 'Power outlets'], ARRAY['Wheelchair access'],
        'One portable PA speaker and a wireless microphone.', 4, now() - interval '5 days', now() - interval '1 day'),
    ('00000000-0000-4000-8000-0000000e0002', 1, 'Photography Club Open Studio', 'Introduce new members to the club',
        '', '', '', '', '', '', '', ARRAY[]::text[], ARRAY[]::text[], '', 1, now() - interval '2 days', now() - interval '2 days')
) AS d(id, form_step, event_name, purpose, description, start_date, start_time, end_date, end_time, attendance, layout,
    facilities, accessibility, equipment_needs, version, created_at, updated_at)
JOIN users org ON org.email = pg_temp.demo_email('org');

-- Status history: one row per transition, timestamped in the past, oldest first.
INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at)
SELECT gen_random_uuid(), pg_temp.demo_event_id(p.key), p.path[i - 1], p.path[i],
    COALESCE(pg_temp.demo_uid(p.coord), pg_temp.demo_uid('org'))::text,
    now() - make_interval(days => cardinality(p.path) - i + 1)
FROM demo_plan p
CROSS JOIN LATERAL generate_series(2, cardinality(p.path)) AS i;

-- ---------------------------------------------------------------------------
-- Venue bookings: approved, pending, rejected, tentative holds, released, and blocked periods
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE demo_booking (
    ek integer NOT NULL,
    vk integer NOT NULL,
    status text NOT NULL,
    kind text NOT NULL,
    hold_day integer,
    rejection text,
    released boolean NOT NULL DEFAULT false,
    special text
) ON COMMIT DROP;

INSERT INTO demo_booking (ek, vk, status, kind, hold_day, rejection, released, special) VALUES
    (19, 9, 'pending', 'booking', NULL, NULL, false, 'Quiet room for panel rehearsal'),
    (19, 4, 'pending', 'tentative_hold', NULL, NULL, false, NULL),
    (20, 4, 'approved', 'tentative_hold', 10, NULL, false, NULL),
    (21, 2, 'approved', 'booking', NULL, NULL, false, NULL),
    (22, 1, 'approved', 'booking', NULL, NULL, false, 'Stage access needed from 5pm'),
    (23, 7, 'rejected', 'booking', NULL, 'Room double-booked by the Faculty Board meeting.', false, NULL),
    (23, 7, 'approved', 'booking', NULL, NULL, false, NULL),
    (24, 8, 'approved', 'booking', NULL, NULL, false, NULL),
    (25, 2, 'approved', 'booking', NULL, NULL, false, NULL),
    (26, 3, 'approved', 'booking', NULL, NULL, false, NULL),
    (27, 1, 'approved', 'booking', NULL, NULL, false, 'Live streaming feed required'),
    (28, 5, 'approved', 'booking', NULL, NULL, false, NULL),
    (29, 6, 'approved', 'booking', NULL, NULL, false, NULL),
    (30, 5, 'approved', 'booking', NULL, NULL, false, NULL),
    (31, 10, 'approved', 'booking', NULL, NULL, false, NULL),
    (32, 1, 'approved', 'booking', NULL, NULL, false, NULL),
    (33, 8, 'approved', 'booking', NULL, NULL, false, NULL),
    (34, 9, 'approved', 'booking', NULL, NULL, false, NULL),
    (35, 6, 'approved', 'booking', NULL, NULL, false, NULL),
    (36, 4, 'approved', 'booking', NULL, NULL, false, NULL),
    (37, 7, 'approved', 'booking', NULL, NULL, false, NULL),
    (38, 1, 'approved', 'booking', NULL, NULL, false, NULL),
    (39, 2, 'approved', 'booking', NULL, NULL, false, NULL),
    (40, 3, 'approved', 'booking', NULL, NULL, false, NULL),
    (41, 4, 'approved', 'booking', NULL, NULL, false, NULL),
    (42, 5, 'approved', 'booking', NULL, NULL, false, NULL),
    (43, 10, 'approved', 'booking', NULL, NULL, false, NULL),
    (44, 3, 'approved', 'booking', NULL, NULL, false, NULL),
    (46, 1, 'released', 'booking', NULL, NULL, true, NULL),
    (47, 3, 'released', 'booking', NULL, NULL, true, NULL),
    (48, 9, 'released', 'booking', NULL, NULL, true, NULL);

INSERT INTO venue_bookings (id, venue_id, event_id, start_at, end_at, status, reason, hold_expires_at, released_at,
    rejection_reason, special_request, request_kind, reassessment_required, created_at)
SELECT gen_random_uuid(), pg_temp.demo_venue_id(b.vk), e.id, e.start_date_time, e.end_date_time, b.status, NULL,
    CASE WHEN b.hold_day IS NOT NULL THEN pg_temp.demo_at(b.hold_day, 18) END,
    CASE WHEN b.released THEN now() - interval '1 day' END,
    b.rejection, b.special, b.kind, false, e.created_at + interval '1 day'
FROM demo_booking b
JOIN events e ON e.id = pg_temp.demo_event_id(b.ek);

-- Blocked periods (venue unavailability). Fixed IDs so the history rows can point at them.
INSERT INTO venue_bookings (id, venue_id, event_id, start_at, end_at, status, reason, created_at) VALUES
    ('00000000-0000-4000-8000-0000000f0001', pg_temp.demo_venue_id(3), NULL, pg_temp.demo_at(20, 16), pg_temp.demo_at(20, 19.5), 'blocked', 'Reserved for a government grant briefing', now() - interval '2 days'),
    ('00000000-0000-4000-8000-0000000f0002', pg_temp.demo_venue_id(8), NULL, pg_temp.demo_at(30, 9), pg_temp.demo_at(30, 18), 'blocked', 'Rooftop waterproofing works', now() - interval '5 days'),
    ('00000000-0000-4000-8000-0000000f0003', pg_temp.demo_venue_id(2), NULL, pg_temp.demo_at(-20, 8), pg_temp.demo_at(-20, 12), 'blocked', 'AV system repair (finished early)', now() - interval '25 days'),
    ('00000000-0000-4000-8000-0000000f0004', pg_temp.demo_venue_id(6), NULL, pg_temp.demo_at(-5, 8), pg_temp.demo_at(-5, 12), 'blocked', 'Studio deep clean', now() - interval '8 days');

INSERT INTO venue_unavailability_history (id, venue_id, period_id, action, start_at, end_at, previous_end_at, reason, actor_user_id, created_at) VALUES
    (gen_random_uuid(), pg_temp.demo_venue_id(3), '00000000-0000-4000-8000-0000000f0001', 'created', pg_temp.demo_at(20, 16), pg_temp.demo_at(20, 19.5), NULL, 'Reserved for a government grant briefing', pg_temp.demo_uid('vs'), now() - interval '2 days'),
    (gen_random_uuid(), pg_temp.demo_venue_id(8), '00000000-0000-4000-8000-0000000f0002', 'created', pg_temp.demo_at(30, 9), pg_temp.demo_at(30, 18), NULL, 'Rooftop waterproofing works', pg_temp.demo_uid('vs'), now() - interval '5 days'),
    (gen_random_uuid(), pg_temp.demo_venue_id(2), '00000000-0000-4000-8000-0000000f0003', 'created', pg_temp.demo_at(-20, 8), pg_temp.demo_at(-20, 17), NULL, 'AV system repair (finished early)', pg_temp.demo_uid('vs'), now() - interval '25 days'),
    (gen_random_uuid(), pg_temp.demo_venue_id(2), '00000000-0000-4000-8000-0000000f0003', 'ended_early', pg_temp.demo_at(-20, 8), pg_temp.demo_at(-20, 12), pg_temp.demo_at(-20, 17), 'AV system repair (finished early)', pg_temp.demo_uid('vs'), now() - interval '20 days'),
    (gen_random_uuid(), pg_temp.demo_venue_id(6), '00000000-0000-4000-8000-0000000f0004', 'created', pg_temp.demo_at(-5, 8), pg_temp.demo_at(-5, 12), NULL, 'Studio deep clean', pg_temp.demo_uid('vs'), now() - interval '8 days');

-- Booking decisions made by venue staff.
INSERT INTO booking_review_log (booking_id, actor_user_id, action, reason, created_at)
SELECT b.id, pg_temp.demo_uid('vs'),
    CASE WHEN b.status = 'approved' THEN 'approved' ELSE 'rejected' END,
    CASE WHEN b.status = 'rejected' THEN b.rejection_reason END,
    b.created_at + interval '2 days'
FROM venue_bookings b
WHERE b.status IN ('approved', 'rejected') AND b.request_kind = 'booking' AND b.event_id IS NOT NULL;

INSERT INTO venue_booking_requests (event_id, venue_id, special_request)
SELECT b.event_id, b.venue_id, b.special_request
FROM venue_bookings b
WHERE b.status = 'pending' AND b.event_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Equipment requests, items and reservations
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE demo_req (
    ek integer PRIMARY KEY,
    status text NOT NULL,
    reason text
) ON COMMIT DROP;

INSERT INTO demo_req VALUES
    (19, 'Pending Review', NULL),
    (20, 'Pending Review', NULL),
    (21, 'Reserved', NULL),
    (22, 'Unavailable', NULL),
    (23, 'Reserved', NULL),
    (24, 'Cannot Provide', 'Smoke machines are not permitted on the rooftop terrace.'),
    (25, 'Reserved', NULL),
    (27, 'Reserved', NULL),
    (30, 'Reserved', NULL),
    (36, 'Reserved', NULL),
    (46, 'Cancelled', NULL);

CREATE TEMP TABLE demo_item (
    ek integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    qty integer NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_item VALUES
    (19, 'Wireless Microphone', 'Audio', 2),
    (19, 'Portable PA Speaker', 'Audio', 1),
    (20, 'LED Light Panel', 'Lighting', 4),
    (21, 'Projector 4K', 'Visual', 1),
    (21, 'Portable Projector Screen', 'Visual', 1),
    (22, 'Video Conferencing Camera', 'Visual', 1),
    (23, 'Projector 4K', 'Visual', 1),
    (23, 'Portable Projector Screen', 'Visual', 1),
    (24, 'Smoke Machine', 'Other', 1),
    (25, 'Wireless Microphone', 'Audio', 2),
    (25, 'Portable PA Speaker', 'Audio', 1),
    (27, 'Portable PA Speaker', 'Audio', 2),
    (27, 'Lapel Microphone', 'Audio', 2),
    (27, 'Stage Lighting Par Can', 'Lighting', 8),
    (30, 'Projector 4K', 'Visual', 1),
    (36, 'Stackable Chair', 'Furniture', 40),
    (46, 'Wireless Microphone', 'Audio', 1);

INSERT INTO equipment_requests (id, event_id, requested_by, status, decision_reason, created_at, updated_at)
SELECT gen_random_uuid(), pg_temp.demo_event_id(r.ek), COALESCE(coord.id, org.id), r.status, r.reason,
    e.created_at + interval '2 days', now()
FROM demo_req r
JOIN events e ON e.id = pg_temp.demo_event_id(r.ek)
JOIN users org ON org.email = pg_temp.demo_email('org')
LEFT JOIN users coord ON coord.id::text = e.coordinator_id;

INSERT INTO equipment_request_items (request_id, equipment_name, equipment_type, quantity, item_order)
SELECT rq.id, i.name, i.type, i.qty,
    row_number() OVER (PARTITION BY rq.id ORDER BY i.name)
FROM demo_item i
JOIN equipment_requests rq ON rq.event_id = pg_temp.demo_event_id(i.ek);

INSERT INTO equipment_reservations (id, event_id, equipment_name, quantity, status, equipment_request_item_id, released_at, created_at, updated_at)
SELECT gen_random_uuid(), rq.event_id, ri.equipment_name, ri.quantity,
    CASE rq.status
        WHEN 'Pending Review' THEN 'Requested'
        WHEN 'Reserved' THEN 'Reserved'
        WHEN 'Unavailable' THEN 'Unavailable'
        ELSE 'Released'
    END,
    ri.id,
    CASE WHEN rq.status = 'Cancelled' THEN now() - interval '1 day' END,
    now(), now()
FROM equipment_requests rq
JOIN equipment_request_items ri ON ri.request_id = rq.id
WHERE rq.status <> 'Cannot Provide';

-- ---------------------------------------------------------------------------
-- Registrations (only five attendee accounts exist, so waitlists and report rows are small)
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE demo_reg (
    ek integer NOT NULL,
    att text NOT NULL,
    st text NOT NULL,
    wl integer,
    note text
) ON COMMIT DROP;

INSERT INTO demo_reg (ek, att, st, wl, note) VALUES
    (25, 'att1', 'Registered', NULL, NULL),
    (25, 'att2', 'Registered', NULL, NULL),
    (25, 'att3', 'Registered', NULL, NULL),
    (25, 'att4', 'Waitlisted', 1, NULL),
    (25, 'att5', 'Waitlisted', 2, NULL),
    (27, 'att1', 'Registered', NULL, NULL),
    (27, 'att2', 'Registered', NULL, NULL),
    (27, 'att3', 'Registered', NULL, NULL),
    (27, 'att4', 'Withdrawn', NULL, NULL),
    (27, 'att5', 'Removed', NULL, 'Duplicate registration removed by the organiser'),
    (29, 'att1', 'Registered', NULL, NULL),
    (29, 'att3', 'Registered', NULL, NULL),
    (30, 'att2', 'Registered', NULL, NULL),
    (30, 'att4', 'Registered', NULL, NULL),
    (30, 'att5', 'Cancelled', NULL, 'Unable to attend because of a timetable clash'),
    (31, 'att1', 'Registered', NULL, NULL),
    (31, 'att3', 'Registered', NULL, NULL),
    (31, 'att5', 'Registered', NULL, NULL),
    (32, 'att2', 'Registered', NULL, NULL),
    (33, 'att1', 'Registered', NULL, NULL),
    (33, 'att4', 'Withdrawn', NULL, NULL),
    (34, 'att2', 'Registered', NULL, NULL),
    (34, 'att3', 'Registered', NULL, NULL),
    (34, 'att4', 'Registered', NULL, NULL),
    (47, 'att1', 'Cancelled', NULL, 'Event cancelled by the coordinator'),
    (47, 'att2', 'Cancelled', NULL, 'Event cancelled by the coordinator'),
    (47, 'att3', 'Cancelled', NULL, 'Event cancelled by the coordinator');

-- Past events: most attendees registered (every fifth pairing skipped for variety).
INSERT INTO demo_reg (ek, att, st, wl, note)
SELECT e.k, 'att' || a.n, 'Registered', NULL, NULL
FROM (VALUES (35), (36), (37), (38), (39), (40), (41), (42), (43), (44)) AS e(k)
CROSS JOIN generate_series(1, 5) AS a(n)
WHERE (e.k + a.n) % 5 <> 0;

INSERT INTO event_registrations (id, event_id, attendee_id, status, full_name, email, contact_number, special_requirements,
    withdrawn_at, removed_at, cancellation_reason, registered_at, joined_at, waitlist_seq, created_at, updated_at)
SELECT gen_random_uuid(), pg_temp.demo_event_id(r.ek), u.id, r.st, u.display_name, u.email,
    '+65 8123 ' || lpad(substring(r.att FROM 4), 4, '0'),
    CASE WHEN r.ek = 27 AND r.att = 'att3' THEN 'Vegetarian meal' END,
    CASE WHEN r.st = 'Withdrawn' THEN now() - interval '2 days' END,
    CASE WHEN r.st = 'Removed' THEN now() - interval '1 day' END,
    r.note,
    CASE WHEN r.st <> 'Waitlisted' THEN e.registration_opens_at + interval '2 days' END,
    CASE WHEN r.st = 'Waitlisted' THEN e.registration_opens_at + interval '3 days' + make_interval(mins => r.wl)
         ELSE e.registration_opens_at + interval '2 days' END,
    r.wl::bigint,
    e.registration_opens_at, now()
FROM demo_reg r
JOIN users u ON u.email = pg_temp.demo_email(r.att)
JOIN events e ON e.id = pg_temp.demo_event_id(r.ek);

-- ---------------------------------------------------------------------------
-- Clarifications and replies
-- ---------------------------------------------------------------------------

INSERT INTO event_comments (id, event_id, parent_id, type, author_id, author_name, author_role, message, awaiting_reply, resolved, created_at)
SELECT gen_random_uuid(), pg_temp.demo_event_id(c.ek), NULL, 'clarification', u.id::text, u.display_name, 'coordinator',
    c.message, c.awaiting, c.resolved, now() - interval '3 days'
FROM (VALUES
    (9, 'coord2', 'Could you confirm the expected number of external guests, and whether you need a PA system?', true, false),
    (10, 'coord1', 'Can the caterer provide halal-certified food for the concert interval?', false, true),
    (20, 'coord2', 'Does the symposium need the Learning Hub Atrium or the Community Hall?', true, false)
) AS c(ek, login, message, awaiting, resolved)
JOIN users u ON u.email = pg_temp.demo_email(c.login);

INSERT INTO event_comments (id, event_id, parent_id, type, author_id, author_name, author_role, message, awaiting_reply, resolved, created_at)
SELECT gen_random_uuid(), pg_temp.demo_event_id(10),
    (SELECT id FROM event_comments WHERE event_id = pg_temp.demo_event_id(10) AND type = 'clarification'),
    'reply', org.id::text, org.display_name, 'organiser',
    'Yes, the caterer is halal-certified. The certificate is attached to the request.',
    false, false, now() - interval '2 days'
FROM users org
WHERE org.email = pg_temp.demo_email('org');

-- ---------------------------------------------------------------------------
-- Change requests, their audit trail, cancellation requests and reassignments
-- ---------------------------------------------------------------------------

INSERT INTO event_change_requests (id, event_id, requested_by_id, requested_by, changes, reason, requires_safety_check,
    status, decision_reason, decided_by, decided_by_id, decided_at, created_at)
SELECT gen_random_uuid(), pg_temp.demo_event_id(c.ek), org.id::text, org.display_name, c.changes::jsonb, c.reason, false,
    c.status, c.decision, dec.display_name, dec.id::text, c.decided_at, c.created_at
FROM (VALUES
    (30, '[{"field":"expectedAttendance","originalValue":50,"proposedValue":55}]', 'Two teaching assistants will join the bootcamp.', 'Pending', NULL::text, NULL::text, NULL::timestamptz, now() - interval '2 days'),
    (31, '[{"field":"equipmentNeeds","originalValue":"","proposedValue":"Two wireless microphones for the Q&A."}]', 'Audience questions need a roving microphone.', 'Approved', NULL, 'coord2', now() - interval '4 days', now() - interval '6 days'),
    (32, '[{"field":"expectedAttendance","originalValue":380,"proposedValue":420}]', 'More staff are expected to attend in person.', 'Denied', 'Venue capacity is fixed at 400 for fire safety.', 'coord1', now() - interval '3 days', now() - interval '5 days'),
    (33, '[{"field":"description","originalValue":"Morning yoga session on the rooftop garden.","proposedValue":"Morning yoga session on the rooftop garden, with a warm-up walk."}]', 'Add a warm-up walk to the programme.', 'Withdrawn', NULL, 'org', now() - interval '4 days', now() - interval '7 days'),
    (45, '[{"field":"description","originalValue":"Campus roadshow visiting partner schools.","proposedValue":"Campus roadshow visiting partner schools in the east region."}]', 'Extend the roadshow to eastern schools.', 'Closed', NULL, 'coord1', now() - interval '3 days', now() - interval '8 days')
) AS c(ek, changes, reason, status, decision, decider, decided_at, created_at)
JOIN users org ON org.email = pg_temp.demo_email('org')
LEFT JOIN users dec ON dec.email = pg_temp.demo_email(c.decider);

-- Each finished request gets exactly one audit row (the table is append-only).
INSERT INTO event_change_request_audit (id, change_request_id, event_id, outcome, changes, requested_by_id, requested_by,
    decided_by_id, decided_by, reason, decided_at)
SELECT gen_random_uuid(), cr.id, cr.event_id, cr.status, cr.changes, cr.requested_by_id, cr.requested_by,
    cr.decided_by_id, cr.decided_by, cr.decision_reason, cr.decided_at
FROM event_change_requests cr
WHERE cr.status <> 'Pending';

INSERT INTO event_cancellation_requests (id, event_id, requested_by_id, requested_by, reason, status, requested_at,
    decided_by_id, decided_by, decided_at)
SELECT gen_random_uuid(), pg_temp.demo_event_id(c.ek), org.id::text, org.display_name, c.reason, c.status, c.requested_at,
    dec.id::text, dec.display_name, c.decided_at
FROM (VALUES
    (34, 'Sponsorship funding has been withdrawn, so the fair cannot go ahead.', 'pending', now() - interval '2 days', NULL::text, NULL::timestamptz),
    (33, 'The session is no longer viable after the venue change.', 'declined', now() - interval '6 days', 'coord_vs', now() - interval '5 days'),
    (47, 'The sponsor has cancelled the venue and catering contracts.', 'accepted', now() - interval '5 days', 'coord1', now() - interval '3 days')
) AS c(ek, reason, status, requested_at, decider, decided_at)
JOIN users org ON org.email = pg_temp.demo_email('org')
LEFT JOIN users dec ON dec.email = pg_temp.demo_email(c.decider);

INSERT INTO event_reassignments (id, event_id, from_coordinator_id, from_coordinator_name, to_coordinator_id, to_coordinator_name,
    reassigned_by, reassigned_at)
SELECT gen_random_uuid(), pg_temp.demo_event_id(r.ek), f.id::text, f.display_name, t.id::text, t.display_name,
    lead.display_name, r.at
FROM (VALUES
    (9, 'coord1', 'coord2', now() - interval '3 days'),
    (26, 'coord2', 'coord1', now() - interval '6 days')
) AS r(ek, from_login, to_login, at)
JOIN users f ON f.email = pg_temp.demo_email(r.from_login)
JOIN users t ON t.email = pg_temp.demo_email(r.to_login)
JOIN users lead ON lead.email = pg_temp.demo_email('lead');

-- ---------------------------------------------------------------------------
-- Event change history (event_flagged_changes, SPM-156): flagged, directly applied and
-- change-request changes. Written after the events, bookings and change requests exist.
-- ---------------------------------------------------------------------------

-- A change request the demo shows as Approved is also recorded as an applied change:
-- proposed by the organiser, applied by the approving coordinator at the decision time.
INSERT INTO event_flagged_changes (id, event_id, kind, field, original_value, proposed_value, impacts, equipment_impacts,
    status, proposed_by, proposed_by_id, created_at, resolved_by, resolved_by_id, resolved_at)
SELECT gen_random_uuid(), cr.event_id, 'change_request', ch.item ->> 'field',
    ch.item -> 'originalValue', ch.item -> 'proposedValue', '[]'::jsonb, '[]'::jsonb,
    'Applied', cr.requested_by, cr.requested_by_id, cr.decided_at, cr.decided_by, cr.decided_by_id, cr.decided_at
FROM event_change_requests cr
CROSS JOIN LATERAL jsonb_array_elements(cr.changes) AS ch(item)
WHERE cr.status = 'Approved';

-- Changes a coordinator made straight to the event: proposed and applied by the same person.
INSERT INTO event_flagged_changes (id, event_id, kind, field, original_value, proposed_value, impacts, equipment_impacts,
    status, proposed_by, proposed_by_id, created_at, resolved_by, resolved_by_id, resolved_at)
SELECT gen_random_uuid(), pg_temp.demo_event_id(d.ek), 'direct_update', d.field, to_jsonb(d.original_value), to_jsonb(d.proposed_value),
    '[]'::jsonb, '[]'::jsonb, 'Applied', c.display_name, c.id::text, d.at, c.display_name, c.id::text, d.at
FROM (VALUES
    (25, 'coord1', 'description', 'A keynote and panel on sustainable urban design.',
        'A keynote and panel on sustainable urban design. Registration is capped at 3 to show a waitlist.', now() - interval '9 days'),
    (28, 'coord2', 'description', 'Team-building and leadership workshops over one day.',
        'Team-building and leadership workshops over one day. Registration opens later.', now() - interval '7 days')
) AS d(ek, login, field, original_value, proposed_value, at)
JOIN users c ON c.email = pg_temp.demo_email(d.login);

-- A booking-sensitive change the venue accepted without any conflict: flagged, reviewed and
-- applied by the coordinator. The Science Open Day's expected attendance is 320, so this
-- is how it got there (Main Auditorium holds 400).
INSERT INTO event_flagged_changes (id, event_id, kind, field, original_value, proposed_value, impacts, equipment_impacts,
    status, proposed_by, proposed_by_id, created_at, resolved_by, resolved_by_id, resolved_at)
SELECT gen_random_uuid(), e.id, 'booking_conflict', 'expectedAttendance', '300'::jsonb, '320'::jsonb,
    jsonb_build_array(jsonb_build_object('bookingId', b.id, 'venueId', b.venue_id, 'venueName', 'Main Auditorium',
        'impacted', false, 'conflicts', '[]'::jsonb,
        'decision', 'Applied', 'decidedBy', c.display_name, 'decidedAt', now() - interval '6 days')),
    '[]'::jsonb, 'Applied', org.display_name, org.id::text, now() - interval '6 days' - interval '2 hours',
    c.display_name, c.id::text, now() - interval '6 days'
FROM events e
JOIN venue_bookings b ON b.event_id = e.id AND b.status = 'approved'
JOIN users c ON c.email = pg_temp.demo_email('coord_vs')
JOIN users org ON org.email = pg_temp.demo_email('org')
WHERE e.id = pg_temp.demo_event_id(27);

-- The Community Health Fair story: the organiser asked to start at 4:30pm, which overlaps
-- Community Hall's blocked period (4pm to 7:30pm), so the change is flagged and waits for review.
INSERT INTO event_flagged_changes (id, event_id, kind, field, original_value, proposed_value, impacts, equipment_impacts,
    status, proposed_by, proposed_by_id, created_at)
SELECT gen_random_uuid(), e.id, 'booking_conflict', 'startDateTime',
    to_jsonb(to_char(e.start_date_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    to_jsonb(to_char(pg_temp.demo_at(20, 16.5) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    jsonb_build_array(jsonb_build_object('bookingId', b.id, 'venueId', b.venue_id, 'venueName', 'Community Hall',
        'impacted', true,
        'conflicts', jsonb_build_array(jsonb_build_object('kind', 'overlap',
            'withBookingId', '00000000-0000-4000-8000-0000000f0001',
            'detail', 'Overlaps a blocked period: Reserved for a government grant briefing.')))),
    '[]'::jsonb, 'Needs Review', org.display_name, org.id::text, now() - interval '1 day'
FROM events e
JOIN venue_bookings b ON b.event_id = e.id AND b.status = 'approved' AND b.request_kind = 'booking'
JOIN users org ON org.email = pg_temp.demo_email('org')
WHERE e.id = pg_temp.demo_event_id(26);

-- ---------------------------------------------------------------------------
-- Completion records for finished events
-- ---------------------------------------------------------------------------

INSERT INTO completion_records (event_id, attendance_count, operational_notes, updated_by, updated_at)
SELECT pg_temp.demo_event_id(c.ek), c.attendance, c.notes, c.by, now() - interval '1 day'
FROM (VALUES
    (38, 352, 'Crowd moved smoothly between stations. One first-aid case handled on site.', 'Daniel Lim'),
    (39, 198, 'Finals ran on schedule. Stage timer was used throughout.', 'Aisha Rahman'),
    (40, 84, 'Mentoring rounds ran on time. Two rooms were rearranged between rounds.', 'Marcus Tan'),
    (41, 58, 'Briefing finished early. Marshal vests returned in full.', 'Daniel Lim'),
    (42, 51, 'Seminar held in the Seminar Room. Attendance was slightly lower than registered.', 'Aisha Rahman'),
    (43, 44, 'Bootcamp materials were restocked before the second session.', 'Marcus Tan'),
    (44, 70, 'Judging ran late by about 20 minutes. Catering was on site from 4pm.', 'Daniel Lim')
) AS c(ek, attendance, notes, by);

INSERT INTO completion_record_issues (event_id, position, description) VALUES
    (pg_temp.demo_event_id(39), 1, 'The second microphone battery ran low during the final round.'),
    (pg_temp.demo_event_id(42), 1, 'The projector lamp was replaced mid-session.'),
    (pg_temp.demo_event_id(42), 2, 'The room was too warm; the air-conditioning took 30 minutes to adjust.');

-- ---------------------------------------------------------------------------
-- Notifications for every role. Recipients are user IDs stored as text.
-- ---------------------------------------------------------------------------

-- Organiser: approvals, rejections, confirmations and cancellations.
INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), org.id::text, 'approval',
    'Your event "' || p.event_name || '" has been approved.',
    pg_temp.demo_event_id(p.key), p.key % 2 = 0, pg_temp.demo_at(p.day - 25, 9)
FROM demo_plan p
JOIN users org ON org.email = pg_temp.demo_email('org')
WHERE 'Approved' = ANY (p.path);

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), org.id::text, 'rejection',
    'Your event "' || p.event_name || '" was rejected. Reason: ' || p.rejection_reason,
    pg_temp.demo_event_id(p.key), false, pg_temp.demo_at(p.day - 20, 9)
FROM demo_plan p
JOIN users org ON org.email = pg_temp.demo_email('org')
WHERE p.status = 'Rejected';

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), org.id::text, 'EventConfirmed',
    'Your event "' || p.event_name || '" is confirmed and ready to go.',
    pg_temp.demo_event_id(p.key), p.key % 2 = 1, pg_temp.demo_at(p.day - 15, 9)
FROM demo_plan p
JOIN users org ON org.email = pg_temp.demo_email('org')
WHERE 'Confirmed' = ANY (p.path);

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), org.id::text, 'EventCancelled',
    'Your event "' || p.event_name || '" has been cancelled.',
    pg_temp.demo_event_id(p.key), false, now() - interval '3 days'
FROM demo_plan p
JOIN users org ON org.email = pg_temp.demo_email('org')
WHERE p.status = 'Cancelled';

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), org.id::text,
    CASE cr.status WHEN 'Approved' THEN 'change_request_approved' ELSE 'change_request_denied' END,
    CASE cr.status
        WHEN 'Approved' THEN 'Your change request for "' || e.event_name || '" was approved.'
        ELSE 'Your change request for "' || e.event_name || '" was denied. Reason: ' || cr.decision_reason
    END,
    e.id, cr.status = 'Denied', cr.decided_at
FROM event_change_requests cr
JOIN events e ON e.id = cr.event_id
JOIN users org ON org.email = pg_temp.demo_email('org')
WHERE cr.status IN ('Approved', 'Denied');

-- Coordinators: assignments, change requests, venue decisions and safety responses.
INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), c.id::text, 'coordinator_assignment',
    'You have been assigned to "' || p.event_name || '".',
    pg_temp.demo_event_id(p.key), p.key % 3 = 0, pg_temp.demo_at(p.day - 26, 9)
FROM demo_plan p
JOIN users c ON c.email = pg_temp.demo_email(p.coord)
WHERE p.coord IS NOT NULL;

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), e.coordinator_id, 'coordinator_reassignment',
    'You have been reassigned to "' || e.event_name || '" by the Coordinator Lead.',
    e.id, false, now() - interval '3 days'
FROM events e
WHERE e.id IN (pg_temp.demo_event_id(9), pg_temp.demo_event_id(26));

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), e.coordinator_id, 'coordinator_change_request',
    'Priya Nair requested a change to "' || e.event_name || '".',
    e.id, cr.status <> 'Pending', cr.created_at
FROM event_change_requests cr
JOIN events e ON e.id = cr.event_id
WHERE e.coordinator_id IS NOT NULL;

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_booking_id, read, created_at)
SELECT gen_random_uuid(), e.coordinator_id, 'venue_booking_approved',
    'Venue "' || v.name || '" approved the booking for "' || e.event_name || '".',
    e.id, b.id, true, b.created_at + interval '2 days'
FROM venue_bookings b
JOIN events e ON e.id = b.event_id
JOIN venues v ON v.id = b.venue_id
WHERE b.status = 'approved' AND b.request_kind = 'booking' AND e.coordinator_id IS NOT NULL;

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_booking_id, read, created_at)
SELECT gen_random_uuid(), e.coordinator_id, 'venue_booking_rejected',
    'Venue "' || v.name || '" rejected the booking for "' || e.event_name || '". Reason: ' || b.rejection_reason,
    e.id, b.id, false, now() - interval '1 day'
FROM venue_bookings b
JOIN events e ON e.id = b.event_id
JOIN venues v ON v.id = b.venue_id
WHERE b.status = 'rejected';

-- Community Hall's blocked period (created two days ago) overlaps the approved Community Health Fair booking.
INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_booking_id, read, created_at)
SELECT gen_random_uuid(), e.coordinator_id, 'venue_unavailable_impact',
    'Community Hall is blocked for part of the booking for "' || e.event_name || '". Review the booking with the venue team.',
    e.id, b.id, false, now() - interval '2 days'
FROM venue_bookings b
JOIN events e ON e.id = b.event_id
WHERE b.status = 'approved' AND b.request_kind = 'booking' AND e.event_name = 'Community Health Fair';

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), e.coordinator_id, 'EventCancelled',
    'The event "' || e.event_name || '" has been cancelled.',
    e.id, true, now() - interval '3 days'
FROM events e
WHERE e.status = 'Cancelled' AND e.coordinator_id IS NOT NULL;

-- Lead: a coordinator with active events is unavailable.
INSERT INTO notifications (id, recipient_id, type, message, related_user_id, read, created_at)
SELECT gen_random_uuid(), lead.id::text, 'coordinator_unavailable',
    'Aisha Rahman is marked unavailable but still has active events.',
    c.id, false, now() - interval '1 day'
FROM users lead
JOIN users c ON c.email = pg_temp.demo_email('coord2')
WHERE lead.email = pg_temp.demo_email('lead');

-- Clarifications: questions go to the organiser; the reply goes to the coordinator.
INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), org.id::text, 'clarification',
    'Aisha Rahman asked a question about "' || e.event_name || '".',
    e.id, false, now() - interval '3 days'
FROM events e
JOIN users org ON org.email = pg_temp.demo_email('org')
WHERE e.id IN (pg_temp.demo_event_id(9), pg_temp.demo_event_id(20));

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), e.coordinator_id, 'reply',
    'The organiser replied to your question about "' || e.event_name || '".',
    e.id, false, now() - interval '2 days'
FROM events e
WHERE e.id = pg_temp.demo_event_id(10);

-- Attendees: a waitlist promotion and cancellation notices.
INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), u.id::text, 'WaitlistPromoted',
    'A place opened up and you have been moved off the waitlist for "' || e.event_name || '".',
    e.id, false, now() - interval '1 day'
FROM users u
JOIN events e ON e.id = pg_temp.demo_event_id(34)
WHERE u.email = pg_temp.demo_email('att2');

INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), u.id::text, 'EventCancelled',
    'The event "' || p.event_name || '" has been cancelled, so your registration has been cancelled.',
    pg_temp.demo_event_id(p.key), false, now() - interval '3 days'
FROM demo_reg r
JOIN demo_plan p ON p.key = r.ek
JOIN users u ON u.email = pg_temp.demo_email(r.att)
WHERE r.st = 'Cancelled' AND p.status = 'Cancelled';

-- ---------------------------------------------------------------------------
-- Safety checks and feedback. Inserted last: booking and reservation inserts
-- above would otherwise reset them through the safety-invalidation triggers.
-- ---------------------------------------------------------------------------

INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, feedback, decided_at)
SELECT pg_temp.demo_event_id(s.ek), s.status,
    CASE WHEN s.status = 'pending' THEN now() - interval '3 days' ELSE e.created_at + interval '10 days' END,
    'Priya Nair',
    CASE WHEN s.status = 'pending' THEN NULL ELSE 'Dr Rachel Goh' END,
    s.feedback,
    CASE WHEN s.status = 'pending' THEN NULL ELSE e.created_at + interval '12 days' END
FROM (VALUES
    (21, 'pending', NULL::text),
    (22, 'changes_needed', 'Provide the rigger certificate for the stage truss and a revised crowd-flow plan for the lawn.'),
    (24, 'rejected', 'Rooftop access is not approved after 9pm without a second exit route.'),
    (23, 'approved', NULL),
    (25, 'approved', NULL),
    (26, 'approved', NULL),
    (27, 'approved', NULL),
    (28, 'approved', NULL),
    (29, 'approved', NULL),
    (30, 'approved', NULL),
    (31, 'approved', NULL),
    (32, 'approved', NULL),
    (33, 'approved', NULL),
    (34, 'approved', NULL),
    (35, 'approved', NULL),
    (36, 'approved', NULL),
    (37, 'approved', NULL),
    (38, 'approved', NULL),
    (39, 'approved', NULL),
    (40, 'approved', NULL),
    (41, 'approved', NULL),
    (42, 'approved', NULL),
    (43, 'approved', NULL),
    (44, 'approved', NULL),
    (47, 'approved', NULL)
) AS s(ek, status, feedback)
JOIN events e ON e.id = pg_temp.demo_event_id(s.ek);

INSERT INTO safety_check_feedback_items (event_id, feedback_text, requested_at, resolved_by_coordinator_at) VALUES
    (pg_temp.demo_event_id(22), 'Provide the rigger certificate for the stage truss.', now() - interval '5 days', now() - interval '1 day'),
    (pg_temp.demo_event_id(22), 'Submit a revised crowd-flow plan for the lawn area.', now() - interval '5 days', NULL),
    (pg_temp.demo_event_id(24), 'Confirm a second exit route for rooftop access after 9pm.', now() - interval '8 days', NULL);

-- Safety responses need the safety rows above, so they are written after them.
INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read, created_at)
SELECT gen_random_uuid(), e.coordinator_id, 'coordinator_safety_response',
    CASE s.status
        WHEN 'changes_needed' THEN 'Dr Rachel Goh requested changes to the safety check for "' || e.event_name || '".'
        ELSE 'Dr Rachel Goh rejected the safety check for "' || e.event_name || '".'
    END,
    e.id, false, s.decided_at
FROM event_safety_checks s
JOIN events e ON e.id = s.event_id
WHERE s.status IN ('changes_needed', 'rejected');

COMMIT;
