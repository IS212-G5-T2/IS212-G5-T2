-- Local-only, idempotent development seed data. Passwords are not production credentials.
INSERT INTO app_health_checks (source) SELECT 'compose-init' WHERE NOT EXISTS (SELECT 1 FROM app_health_checks WHERE source = 'compose-init');

INSERT INTO roles (id, name, description) VALUES
    (1, 'ORGANISER', 'Creates and manages event requests, including drafts and change requests, and views relevant event and registration information.'),
    (2, 'COORDINATOR', 'Reviews and coordinates events, manages approvals, venue bookings, equipment requirements, and event changes.'),
    (3, 'VENUE_STAFF', 'Manages venue-related information and reviews venue booking requests, including approving or rejecting bookings.'),
    (4, 'TECH_SUPPORT', 'Manages equipment-related requests, checks equipment availability, and handles equipment reservations for events.'),
    (5, 'ATTENDEE', 'Views appropriate event information, registers for events, checks registration status, and withdraws registrations.'),
    (6, 'COORDINATOR_LEAD', 'Assigns each unassigned event request to an available Event Coordinator based on current workload.'),
    (7, 'SAFETY_OFFICER', 'Reviews safety arrangements for events that require a safety check before they can proceed.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO resources (id, name, description) VALUES
    (1, 'Event', 'Represents an event and its core information, including event details, requirements, organiser, assigned coordinator, and current status.'),
    (2, 'Event Review', 'Represents the coordinator-side review of a submitted event, including clarification requests and approval or rejection decisions.'),
    (3, 'Event Change Request', 'Represents a request by an organiser to change important information of an already-submitted event and the subsequent processing of that request.'),
    (4, 'Venue', 'Represents a physical venue and its relatively static information, such as location, capacity, facilities, accessibility, layouts, and operating information.'),
    (5, 'Venue Unavailability', 'Represents manually recorded periods when a venue cannot be used, such as maintenance or closure. Venue availability itself is derived from these periods together with existing bookings.'),
    (6, 'Venue Booking', 'Represents the reservation/request to use a particular venue for an event during a specified period, including its pending, approved, or rejected state.'),
    (7, 'Equipment Request', 'Represents named equipment items requested for an event, including equipment name, equipment type, and quantity.'),
    (8, 'Equipment Reservation', 'Represents equipment allocated or reserved for a particular event and time period.'),
    (9, 'Attendee Registration', 'Represents an attendee''s registration for an event, including their registration status and withdrawal.'),
    (10, 'Notification', 'Represents a notification delivered to a user about relevant event-related activity, such as approvals, changes, bookings, or cancellations.'),
    (11, 'Equipment', 'Represents the total equipment inventory managed by Technical Support.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO accessibility_features (id, label) VALUES
    ('wheelchair-access', 'Wheelchair access'),
    ('accessible-restrooms', 'Accessible restrooms'),
    ('hearing-loop', 'Hearing loop'),
    ('elevator-access', 'Elevator access')
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, is_active = true;

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

INSERT INTO role_permissions (role_id, resource_id, "create", "read", "update", "delete") VALUES
    (1, 1, true, true, true, false), (2, 1, false, true, true, false), (3, 1, false, true, false, false), (4, 1, false, true, false, false), (5, 1, false, true, false, false),
    (1, 2, false, true, false, false), (2, 2, true, true, true, false), (1, 3, true, true, false, false), (2, 3, false, true, true, false), (2, 4, false, true, false, false),
    (3, 4, true, true, true, false), (2, 5, false, true, false, false), (3, 5, true, true, true, true), (2, 6, true, true, true, false), (3, 6, false, true, true, false),
    (2, 7, true, true, true, false), (4, 7, false, true, true, false), (2, 8, false, true, false, false), (4, 8, true, true, true, true), (1, 9, false, true, false, false),
    (2, 9, false, true, false, false), (5, 9, true, true, false, true), (1, 10, false, true, false, false), (2, 10, false, true, false, false), (3, 10, false, true, false, false),
    (4, 10, false, true, false, false), (5, 10, false, true, false, false),
    (4, 11, true, true, true, false),
    (6, 1, false, true, true, false), (6, 2, false, true, false, false),
    (7, 1, false, true, false, false)
ON CONFLICT (role_id, resource_id) DO UPDATE SET "create" = EXCLUDED."create", "read" = EXCLUDED."read", "update" = EXCLUDED."update", "delete" = EXCLUDED."delete";

INSERT INTO users (email, display_name, password_hash) VALUES
    ('organiser1@connectsphere.test', 'Organiser 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('organiser2@connectsphere.test', 'Organiser 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('organiser3@connectsphere.test', 'Organiser 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('coordinator1@connectsphere.test', 'Coordinator 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('coordinator2@connectsphere.test', 'Coordinator 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('coordinator3@connectsphere.test', 'Coordinator 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('venue_staff1@connectsphere.test', 'Venue Staff 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('venue_staff2@connectsphere.test', 'Venue Staff 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('venue_staff3@connectsphere.test', 'Venue Staff 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('tech_support1@connectsphere.test', 'Tech Support 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('tech_support2@connectsphere.test', 'Tech Support 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('tech_support3@connectsphere.test', 'Tech Support 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('attendee1@connectsphere.test', 'Attendee 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('attendee2@connectsphere.test', 'Attendee 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('attendee3@connectsphere.test', 'Attendee 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('coordinator_venuestaff@connectsphere.test', 'Coor_Venue', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('lead@connectsphere.test', 'Coordinator Lead', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('safety_officer1@connectsphere.test', 'Safety Officer 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('safety_officer2@connectsphere.test', 'Safety Officer 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('safety_officer3@connectsphere.test', 'Safety Officer 3', crypt('P@55w0rd', gen_salt('bf', 12)))
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true, updated_at = now();

INSERT INTO user_roles (user_id, role_id)
SELECT users.id, roles.id FROM (VALUES
    ('organiser1@connectsphere.test', 'ORGANISER'), ('organiser2@connectsphere.test', 'ORGANISER'), ('organiser3@connectsphere.test', 'ORGANISER'),
    ('coordinator1@connectsphere.test', 'COORDINATOR'), ('coordinator2@connectsphere.test', 'COORDINATOR'), ('coordinator3@connectsphere.test', 'COORDINATOR'),
    ('venue_staff1@connectsphere.test', 'VENUE_STAFF'), ('venue_staff2@connectsphere.test', 'VENUE_STAFF'), ('venue_staff3@connectsphere.test', 'VENUE_STAFF'),
    ('tech_support1@connectsphere.test', 'TECH_SUPPORT'), ('tech_support2@connectsphere.test', 'TECH_SUPPORT'), ('tech_support3@connectsphere.test', 'TECH_SUPPORT'),
    ('attendee1@connectsphere.test', 'ATTENDEE'), ('attendee2@connectsphere.test', 'ATTENDEE'), ('attendee3@connectsphere.test', 'ATTENDEE'),
    ('coordinator_venuestaff@connectsphere.test', 'COORDINATOR'), ('coordinator_venuestaff@connectsphere.test', 'VENUE_STAFF'),
    ('lead@connectsphere.test', 'COORDINATOR_LEAD'),
    ('safety_officer1@connectsphere.test', 'SAFETY_OFFICER'), ('safety_officer2@connectsphere.test', 'SAFETY_OFFICER'), ('safety_officer3@connectsphere.test', 'SAFETY_OFFICER')
) AS assignments(email, role_name)
JOIN users ON users.email = assignments.email
JOIN roles ON roles.name = assignments.role_name
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Fictional event cases cover submitted, approved, rejected, registration, and accessibility workflows.
INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description, start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities, accessibility_needs, equipment_needs, registration_enabled, status, rejection_reason, coordinator_id, coordinator_name, submission_key)
VALUES
    ('00000000-0000-4000-8000-000000000036', 'current-user', 'Demo Organiser', 'organiser@example.test', 'Community Welcome Evening', 'Community building', 'An evening of introductions, short talks and small-group activities.', '2026-12-12 18:00:00+08', '2026-12-12 21:00:00+08', 80, 'Banquet', ARRAY['Catering', 'AV System'], ARRAY['Wheelchair ramps', 'Accessible restrooms'], 'Two wireless microphones and a portable speaker.', false, 'Confirmed', NULL, NULL, NULL, '00000000-0000-4000-8000-000000000036'),
    ('00000000-0000-4000-8000-000000000101', 'current-user', 'Demo Organiser', 'organiser@example.test', 'Student Innovation Expo', 'Showcase student projects', 'Project teams present prototypes and receive feedback from invited industry guests.', '2027-01-16 10:00:00+08', '2027-01-16 16:00:00+08', 180, 'Exhibition', ARRAY['AV System', 'Power outlets', 'Wi-Fi'], ARRAY[]::text[], 'Display tables, presentation screens, and extension cables.', true, 'Submitted', NULL, NULL, NULL, '00000000-0000-4000-8000-000000000101'),
    ('00000000-0000-4000-8000-000000000102', 'current-user', 'Demo Organiser', 'organiser@example.test', 'Alumni Networking Night', 'Connect students with alumni', 'An evening of facilitated networking, career conversations, and a light dinner.', '2027-02-05 18:30:00+08', '2027-02-05 21:30:00+08', 120, 'Cocktail', ARRAY['Catering', 'AV System'], ARRAY['Step-free access', 'Accessible restrooms'], 'One wireless microphone for welcome remarks.', true, 'Approved', NULL, 'coordinator1', 'Coordinator 1', '00000000-0000-4000-8000-000000000102'),
    ('00000000-0000-4000-8000-000000000103', 'current-user', 'Demo Organiser', 'organiser@example.test', 'Inter-Faculty Sports Day', 'Promote student wellbeing', 'Friendly inter-faculty games and recreational activities for the student community.', '2027-02-20 08:00:00+08', '2027-02-20 18:00:00+08', 300, 'Theatre', ARRAY['First aid station', 'PA System'], ARRAY['Step-free access'], 'Outdoor PA system and two handheld microphones.', false, 'Rejected', 'The requested venue is unavailable for the required event duration.', 'coordinator2', 'Coordinator 2', '00000000-0000-4000-8000-000000000103'),
    ('00000000-0000-4000-8000-000000000104', 'current-user', 'Demo Organiser', 'organiser@example.test', 'Inclusive Arts Workshop', 'Encourage creative expression', 'A hands-on workshop where participants create collaborative art with guided support.', '2027-03-13 13:00:00+08', '2027-03-13 16:00:00+08', 45, 'Classroom', ARRAY['Projector', 'Sink access'], ARRAY['Wheelchair ramps', 'Accessible restrooms', 'Quiet room'], 'Projector, speakers, and adjustable-height work tables.', true, 'Confirmed', NULL, NULL, NULL, '00000000-0000-4000-8000-000000000104')
ON CONFLICT DO NOTHING;


-- Consolidated from 005_spm61_dev_seed_fixes.sql
-- Local development data only (SPM-61). Idempotent: every UPDATE only touches
-- seeded rows still in their original state, so re-running it is harmless.

-- 002 stored coordinator ids as the literals 'coordinator1'/'coordinator2',
-- which never match a real users.id, so no coordinator could see these events.
-- Point them at the seeded coordinator accounts.
UPDATE events
SET coordinator_id = users.id::text, coordinator_name = users.display_name
FROM users
WHERE users.email = 'coordinator1@connectsphere.test'
  AND events.id IN ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000104')
  AND (events.coordinator_id IS NULL OR events.coordinator_id = 'coordinator1');

UPDATE events
SET coordinator_id = users.id::text, coordinator_name = users.display_name
FROM users
WHERE users.email = 'coordinator2@connectsphere.test'
  AND events.id = '00000000-0000-4000-8000-000000000103'
  AND events.coordinator_id = 'coordinator2';

-- The attendee page only shows registration once both window bounds exist.
-- Give the two published, registration-enabled seed events an open window.
UPDATE events
SET registration_opens_at = '2026-09-01T00:00:00Z', registration_closes_at = '2027-02-04T16:00:00Z'
WHERE id = '00000000-0000-4000-8000-000000000102'
  AND registration_opens_at IS NULL AND registration_closes_at IS NULL;

UPDATE events
SET registration_opens_at = '2026-09-01T00:00:00Z', registration_closes_at = '2027-03-12T15:59:00Z'
WHERE id = '00000000-0000-4000-8000-000000000104'
  AND registration_opens_at IS NULL AND registration_closes_at IS NULL;


-- Consolidated from 008_spm123_coordinator_lead.sql
-- Add SPM-123's Event Coordinator Lead role and its one development account to
-- existing local volumes. Fresh volumes get these from 002_seed_data.sql.
-- Idempotent; the Lead never also holds the COORDINATOR role.
INSERT INTO roles (id, name, description) VALUES
    (6, 'COORDINATOR_LEAD', 'Assigns each unassigned event request to an available Event Coordinator based on current workload.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, resource_id, "create", "read", "update", "delete") VALUES
    (6, 1, false, true, true, false), (6, 2, false, true, false, false)
ON CONFLICT (role_id, resource_id) DO UPDATE SET "create" = EXCLUDED."create", "read" = EXCLUDED."read", "update" = EXCLUDED."update", "delete" = EXCLUDED."delete";

INSERT INTO users (email, display_name, password_hash) VALUES
    ('lead@connectsphere.test', 'Coordinator Lead', crypt('P@55w0rd', gen_salt('bf', 12)))
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true, updated_at = now();

INSERT INTO user_roles (user_id, role_id)
SELECT users.id, roles.id FROM users JOIN roles ON roles.name = 'COORDINATOR_LEAD'
 WHERE users.email = 'lead@connectsphere.test'
ON CONFLICT (user_id, role_id) DO NOTHING;


-- Consolidated from 008_spm124_sample_venues.sql
-- Local development samples for SPM-124. Apply after the SPM-50 venue schema
-- and SPM-124 schedule table. Safe to rerun without replacing staff records.
DO $$
BEGIN
    INSERT INTO venues (
        id, owner_user_id, name, location, capacity, operating_information,
        setup_time_minutes, turnaround_time_minutes
    )
    SELECT
        '00000000-0000-4000-8000-000000000124'::uuid, u.id,
        'Sample Orchid Hall', 'Main Building, Level 2', 120,
        'Local development sample venue.', 30, 45
    FROM users u WHERE u.email = 'venue_staff1@connectsphere.test'
    ON CONFLICT DO NOTHING;

    INSERT INTO venues (
        id, owner_user_id, name, location, capacity, operating_information,
        setup_time_minutes, turnaround_time_minutes
    )
    SELECT
        '00000000-0000-4000-8000-000000000125'::uuid, u.id,
        'Sample Cedar Studio', 'West Wing, Level 1', 40,
        'Local development sample venue.', 15, 20
    FROM users u WHERE u.email = 'venue_staff1@connectsphere.test'
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_facilities (venue_id, facility_id)
    SELECT v.id, f.id FROM venues v CROSS JOIN facilities f
    WHERE v.id = '00000000-0000-4000-8000-000000000124'::uuid
      AND v.name = 'Sample Orchid Hall' AND v.location = 'Main Building, Level 2'
      AND f.name IN ('AV System', 'Wi-Fi')
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_facilities (venue_id, facility_id)
    SELECT v.id, f.id FROM venues v CROSS JOIN facilities f
    WHERE v.id = '00000000-0000-4000-8000-000000000125'::uuid
      AND v.name = 'Sample Cedar Studio' AND v.location = 'West Wing, Level 1'
      AND f.name IN ('Projector', 'Whiteboard')
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_layouts (venue_id, layout_id)
    SELECT v.id, l.id FROM venues v CROSS JOIN room_layouts l
    WHERE v.id = '00000000-0000-4000-8000-000000000124'::uuid
      AND v.name = 'Sample Orchid Hall' AND v.location = 'Main Building, Level 2'
      AND l.name IN ('Theatre', 'Banquet')
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_layouts (venue_id, layout_id)
    SELECT v.id, l.id FROM venues v CROSS JOIN room_layouts l
    WHERE v.id = '00000000-0000-4000-8000-000000000125'::uuid
      AND v.name = 'Sample Cedar Studio' AND v.location = 'West Wing, Level 1'
      AND l.name IN ('Classroom', 'Boardroom')
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_accessibility (venue_id, accessibility_id)
    SELECT v.id, a.id FROM venues v CROSS JOIN accessibility_features a
    WHERE v.id = '00000000-0000-4000-8000-000000000124'::uuid
      AND v.name = 'Sample Orchid Hall' AND v.location = 'Main Building, Level 2'
      AND a.id IN ('wheelchair-access', 'accessible-restrooms')
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_accessibility (venue_id, accessibility_id)
    SELECT v.id, a.id FROM venues v CROSS JOIN accessibility_features a
    WHERE v.id = '00000000-0000-4000-8000-000000000125'::uuid
      AND v.name = 'Sample Cedar Studio' AND v.location = 'West Wing, Level 1'
      AND a.id = 'wheelchair-access'
    ON CONFLICT DO NOTHING;

    -- Small local illustrations exercise the same data URL image field that
    -- SPM-50 venue records use, without replacing staff-uploaded images.
    INSERT INTO venue_images (venue_id, file_name, mime_type, byte_size, data_url)
    SELECT v.id, sample.file_name, 'image/svg+xml',
        octet_length(sample.svg),
        'data:image/svg+xml;base64,' ||
            replace(encode(convert_to(sample.svg, 'UTF8'), 'base64'), E'\n', '')
    FROM (VALUES
        (
            '00000000-0000-4000-8000-000000000124'::uuid,
            'Sample Orchid Hall', 'Main Building, Level 2',
            'sample-orchid-hall.svg',
            $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#e9d5ff"/><stop offset="1" stop-color="#fdf4ff"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><rect x="95" y="60" width="610" height="280" rx="18" fill="#7c3aed"/><rect x="115" y="82" width="570" height="236" rx="10" fill="#faf5ff"/><path d="M115 265h570v53H115z" fill="#ddd6fe"/><path d="M170 245h460v20H170z" fill="#a78bfa"/><path d="M205 170h390v76H205z" fill="#c4b5fd"/><path d="M250 120h300v35H250z" fill="#8b5cf6"/><circle cx="190" cy="120" r="16" fill="#fbbf24"/><circle cx="610" cy="120" r="16" fill="#fbbf24"/></svg>$svg$
        ),
        (
            '00000000-0000-4000-8000-000000000125'::uuid,
            'Sample Cedar Studio', 'West Wing, Level 1',
            'sample-cedar-studio.svg',
            $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#d1fae5"/><stop offset="1" stop-color="#f0fdf4"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><rect x="75" y="65" width="650" height="270" rx="16" fill="#065f46"/><rect x="95" y="85" width="610" height="230" rx="8" fill="#ecfdf5"/><rect x="170" y="118" width="460" height="105" rx="5" fill="#a7f3d0"/><rect x="190" y="138" width="420" height="65" fill="#047857"/><path d="M145 278h510" stroke="#34d399" stroke-width="18"/><path d="M230 240v75m170-75v75m170-75v75" stroke="#064e3b" stroke-width="18"/><circle cx="400" cy="160" r="18" fill="#fbbf24"/></svg>$svg$
        )
    ) AS sample(venue_id, expected_name, expected_location, file_name, svg)
    JOIN venues v ON v.id = sample.venue_id
        AND v.name = sample.expected_name
        AND v.location = sample.expected_location
    ON CONFLICT (venue_id) DO NOTHING;

    -- Give one sample a visible current status and reason. On an existing
    -- volume, rerunning this file preserves the originally seeded period.
    INSERT INTO venue_bookings (id, venue_id, start_at, end_at, status, reason)
    SELECT '00000000-0000-4000-8000-000000000126'::uuid, v.id,
        now() - interval '1 day', now() + interval '6 days', 'blocked',
        'Audio system maintenance'
    FROM venues v
    WHERE v.id = '00000000-0000-4000-8000-000000000125'::uuid
      AND v.name = 'Sample Cedar Studio' AND v.location = 'West Wing, Level 1'
    ON CONFLICT (id) DO NOTHING;
END $$;
