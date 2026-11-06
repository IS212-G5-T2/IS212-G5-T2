-- Local-only, idempotent development seed data. Passwords are not production credentials.
-- Reference data first (roles, resources, permissions, venue option lists, accounts), then sample data
-- for the demo and the test suites. Runs after 001_schema.sql and before 003_functions_triggers.sql, so
-- none of these inserts fires a trigger. Every insert is ON CONFLICT-guarded and every update is
-- conditional, so repeating it against an initialised database changes nothing.
--
-- Everything is seeded in its current form: option values the venue schema retired (for example
-- 'Wheelchair ramps', 'PA System', 'Quiet room') are not seeded.
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


-- ===================================================================================================
-- Sample events
-- ===================================================================================================

-- Fictional event cases cover submitted, approved, rejected, registration, and accessibility workflows.
-- coordinator1/coordinator2 are resolved to the seeded accounts so each coordinator sees their events.
-- The attendee page only shows registration once both window bounds exist, so the two published,
-- registration-enabled events (102, 104) have an open window.
INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description, start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities, accessibility_needs, equipment_needs, registration_enabled, registration_opens_at, registration_closes_at, status, rejection_reason, coordinator_id, coordinator_name, submission_key)
SELECT seed.id, 'current-user', 'Demo Organiser', 'organiser@example.test', seed.event_name, seed.purpose, seed.description, seed.start_date_time, seed.end_date_time, seed.expected_attendance, seed.preferred_room_layout, seed.required_facilities, seed.accessibility_needs, seed.equipment_needs, seed.registration_enabled, seed.registration_opens_at, seed.registration_closes_at, seed.status, seed.rejection_reason, coordinator.id::text, coordinator.display_name, seed.id
FROM (VALUES
    ('00000000-0000-4000-8000-000000000036'::uuid, 'Community Welcome Evening', 'Community building', 'An evening of introductions, short talks and small-group activities.', '2026-12-12 18:00:00+08'::timestamptz, '2026-12-12 21:00:00+08'::timestamptz, 80, 'Banquet', ARRAY['Catering', 'AV System']::text[], ARRAY['Wheelchair access', 'Accessible restrooms']::text[], 'Two wireless microphones and a portable speaker.', false, NULL::timestamptz, NULL::timestamptz, 'Approved', NULL::text, NULL::text),
    ('00000000-0000-4000-8000-000000000101'::uuid, 'Student Innovation Expo', 'Showcase student projects', 'Project teams present prototypes and receive feedback from invited industry guests.', '2027-01-16 10:00:00+08'::timestamptz, '2027-01-16 16:00:00+08'::timestamptz, 180, 'Exhibition', ARRAY['AV System', 'Power outlets', 'Wi-Fi']::text[], ARRAY[]::text[], 'Display tables, presentation screens, and extension cables.', true, NULL::timestamptz, NULL::timestamptz, 'Submitted', NULL::text, NULL::text),
    ('00000000-0000-4000-8000-000000000102'::uuid, 'Alumni Networking Night', 'Connect students with alumni', 'An evening of facilitated networking, career conversations, and a light dinner.', '2027-02-05 18:30:00+08'::timestamptz, '2027-02-05 21:30:00+08'::timestamptz, 120, 'Cocktail', ARRAY['Catering', 'AV System']::text[], ARRAY['Wheelchair access', 'Accessible restrooms']::text[], 'One wireless microphone for welcome remarks.', true, '2026-09-01T00:00:00Z'::timestamptz, '2027-02-04T16:00:00Z'::timestamptz, 'Approved', NULL::text, 'coordinator1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'Inter-Faculty Sports Day', 'Promote student wellbeing', 'Friendly inter-faculty games and recreational activities for the student community.', '2027-02-20 08:00:00+08'::timestamptz, '2027-02-20 18:00:00+08'::timestamptz, 300, 'Theatre', ARRAY['AV System']::text[], ARRAY['Wheelchair access']::text[], 'Outdoor PA system and two handheld microphones.', false, NULL::timestamptz, NULL::timestamptz, 'Rejected', 'The requested venue is unavailable for the required event duration.', 'coordinator2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000104'::uuid, 'Inclusive Arts Workshop', 'Encourage creative expression', 'A hands-on workshop where participants create collaborative art with guided support.', '2027-03-13 13:00:00+08'::timestamptz, '2027-03-13 16:00:00+08'::timestamptz, 45, 'Classroom', ARRAY['Projector']::text[], ARRAY['Wheelchair access', 'Accessible restrooms']::text[], 'Projector, speakers, and adjustable-height work tables.', true, '2026-09-01T00:00:00Z'::timestamptz, '2027-03-12T15:59:00Z'::timestamptz, 'Approved', NULL::text, 'coordinator1@connectsphere.test')
) AS seed(id, event_name, purpose, description, start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities, accessibility_needs, equipment_needs, registration_enabled, registration_opens_at, registration_closes_at, status, rejection_reason, coordinator_email)
LEFT JOIN users coordinator ON coordinator.email = seed.coordinator_email
ON CONFLICT DO NOTHING;


-- ===================================================================================================
-- Sample venues
-- ===================================================================================================

-- Two sample venues with facilities, layouts, accessibility and illustration images.
-- Safe to rerun without replacing staff records.
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

-- ===================================================================================================
-- SPM-51 / SPM-52 sample events for venue availability and search
-- ===================================================================================================

-- SPM-51 local sample events for exercising venue availability permutations.
-- Idempotent: reruns preserve local sample edits.
-- All five events are assigned to the seeded Coordinator 1 account so they are
-- available in the coordinator's venue booking-request event selector.
INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT sample.id, organiser.id::text, organiser.display_name, organiser.email,
    sample.event_name, sample.purpose, sample.description,
    ((CURRENT_DATE + sample.start_day)::timestamp + sample.start_time)
        AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + sample.end_day)::timestamp + sample.end_time)
        AT TIME ZONE 'Asia/Singapore',
    sample.expected_attendance, sample.room_layout, sample.facilities,
    sample.accessibility, sample.equipment, sample.registration_enabled,
    sample.status, coordinator.id::text, coordinator.display_name, sample.id
FROM (VALUES
    (
        '00000000-0000-4000-8000-000000000201'::uuid,
        'Small classroom workshop', 'Hands-on learning',
        'Short weekday workshop with a small group.', 14, '09:00'::time,
        14, '10:30'::time, 24, 'Classroom', ARRAY['Projector']::text[],
        ARRAY[]::text[], 'Projector and whiteboard markers.', false, 'Approved',
        'organiser1@connectsphere.test'
    ),
    (
        '00000000-0000-4000-8000-000000000202'::uuid,
        'Accessible hybrid seminar', 'Share research',
        'Medium-length seminar with hybrid presentation equipment.', 21,
        '10:00'::time, 21, '13:00'::time, 80, 'Theatre',
        ARRAY['AV System', 'Wi-Fi']::text[],
        ARRAY['Wheelchair access', 'Accessible restrooms']::text[],
        'Two microphones, camera, and presentation screen.', true, 'Approved',
        'organiser2@connectsphere.test'
    ),
    (
        '00000000-0000-4000-8000-000000000203'::uuid,
        'Student innovation expo', 'Showcase prototypes',
        'Large daytime expo with extended setup and attendee flow.', 28,
        '08:00'::time, 28, '17:00'::time, 320, 'Exhibition',
        ARRAY['Power outlets', 'Wi-Fi', 'AV System']::text[],
        ARRAY['Wheelchair access', 'Accessible restrooms']::text[],
        'Display tables, extension cables, and two screens.', true, 'Approved',
        'organiser3@connectsphere.test'
    ),
    (
        '00000000-0000-4000-8000-000000000204'::uuid,
        'Evening alumni networking', 'Connect alumni and students',
        'Evening networking reception with catering and flexible seating.', 35,
        '18:30'::time, 35, '22:00'::time, 145, 'Cocktail',
        ARRAY['Catering', 'AV System']::text[],
        ARRAY['Accessible restrooms']::text[],
        'Wireless microphone and portable speaker.', true, 'Approved',
        'organiser1@connectsphere.test'
    ),
    (
        '00000000-0000-4000-8000-000000000205'::uuid,
        'Overnight production rehearsal', 'Prepare a live production',
        'Late-night rehearsal crossing midnight with a compact crew.', 42,
        '22:00'::time, 43, '02:00'::time, 36, 'Boardroom',
        ARRAY['AV System', 'Power outlets']::text[],
        ARRAY['Wheelchair access']::text[],
        'Audio mixer, lighting controller, and rehearsal microphones.', false,
        'Approved', 'organiser2@connectsphere.test'
    )
) AS sample(
    id, event_name, purpose, description, start_day, start_time, end_day,
    end_time, expected_attendance, room_layout, facilities, accessibility,
    equipment, registration_enabled, status, organiser_email
)
JOIN users organiser ON organiser.email = sample.organiser_email
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

-- Coordinator 2 sample events for venue search with event pre-fill (SPM-52).
INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT sample.id, organiser.id::text, organiser.display_name, organiser.email,
    sample.event_name, sample.purpose, sample.description,
    ((CURRENT_DATE + sample.start_day)::timestamp + sample.start_time)
        AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + sample.end_day)::timestamp + sample.end_time)
        AT TIME ZONE 'Asia/Singapore',
    sample.expected_attendance, sample.room_layout, sample.facilities,
    sample.accessibility, sample.equipment, sample.registration_enabled,
    sample.status, coordinator.id::text, coordinator.display_name, sample.id
FROM (VALUES
    (
        '00000000-0000-4000-8000-000000000206'::uuid,
        'Team planning session', 'Sprint planning',
        'Small team session to review priorities and assign tasks.', 7,
        '14:00'::time, 7, '16:00'::time, 10, 'Boardroom',
        ARRAY['Whiteboard', 'Video conferencing']::text[],
        ARRAY['Elevator access']::text[],
        'Whiteboard markers and video conferencing setup.', false, 'Approved',
        'organiser1@connectsphere.test'
    ),
    (
        '00000000-0000-4000-8000-000000000207'::uuid,
        'Faculty orientation briefing', 'Onboard new faculty',
        'Orientation for new faculty with campus tour briefing.', 14,
        '09:00'::time, 14, '12:00'::time, 50, 'Classroom',
        ARRAY['Projector', 'AV System']::text[],
        ARRAY['Wheelchair access', 'Accessible restrooms']::text[],
        'Projector, portable speaker, and orientation packs.', false, 'Approved',
        'organiser3@connectsphere.test'
    )
) AS sample(
    id, event_name, purpose, description, start_day, start_time, end_day,
    end_time, expected_attendance, room_layout, facilities, accessibility,
    equipment, registration_enabled, status, organiser_email
)
JOIN users organiser ON organiser.email = sample.organiser_email
JOIN users coordinator ON coordinator.email = 'coordinator2@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

-- The accessible hybrid seminar (80 attendees, Theatre, AV System + Wi-Fi) matches Orchid Hall (120),
-- Birch Lecture Hall (180), and Meadow Conference Centre (320); all provide both required accessibility
-- labels and have no sample availability blocks/bookings.


-- ===================================================================================================
-- SPM-51 sample venues
-- ===================================================================================================

-- Additional SPM-51 local venues for catalogue and availability demos.
-- Safe to rerun: fixed UUIDs and ON CONFLICT preserve existing edits.
BEGIN;

CREATE TEMP TABLE spm51_seed_venues (
    id uuid PRIMARY KEY,
    owner_email text NOT NULL,
    name varchar(200) NOT NULL,
    location varchar(300) NOT NULL,
    capacity integer NOT NULL,
    operating_information varchar(200) NOT NULL,
    setup_time_minutes integer NOT NULL,
    turnaround_time_minutes integer NOT NULL,
    facilities text[] NOT NULL,
    layouts text[] NOT NULL,
    accessibility text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO spm51_seed_venues VALUES
('00000000-0000-4000-8000-000000000301', 'venue_staff1@connectsphere.test', 'Sample Birch Lecture Hall', 'North Campus, Block A', 180, 'Lecture hall with tiered seating.',30,45, ARRAY['AV System','Projector','Wi-Fi'], ARRAY['Theatre','Seminar Room'], ARRAY['wheelchair-access','accessible-restrooms']),
('00000000-0000-4000-8000-000000000302', 'venue_staff2@connectsphere.test', 'Sample Maple Meeting Studio', 'North Campus, Block B', 16, 'Compact room for small-group meetings.',0,15, ARRAY['Whiteboard','Wired network'], ARRAY['Boardroom','Hollow square'], ARRAY['elevator-access']),
('00000000-0000-4000-8000-000000000303', 'venue_staff3@connectsphere.test', 'Sample Harbor Ballroom', 'Riverside Centre, Level 3', 450, 'Flexible ballroom for receptions and banquets.',60,60, ARRAY['Catering','Stage','AV System'], ARRAY['Banquet','Cabaret','Standing'], ARRAY['wheelchair-access','accessible-restrooms','hearing-loop']),
('00000000-0000-4000-8000-000000000304', 'venue_staff1@connectsphere.test', 'Sample Skybridge Auditorium', 'Innovation Tower, Level 1', 900, 'Large auditorium with stage and control booth.',90,60, ARRAY['Stage','AV System','Lectern','Video conferencing'], ARRAY['Theatre'], ARRAY['wheelchair-access','accessible-restrooms','hearing-loop','elevator-access']),
('00000000-0000-4000-8000-000000000305', 'venue_staff2@connectsphere.test', 'Sample Fern Training Room', 'West Wing, Level 2', 36, 'Training room with movable tables.',20,20, ARRAY['Projector','Whiteboard','Wi-Fi'], ARRAY['Classroom','U-shape'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000306', 'venue_staff3@connectsphere.test', 'Sample Orchard Gallery', 'Arts Quarter, Ground Floor', 110, 'Bright gallery for showcases and exhibitions.',45,30, ARRAY['Power outlets','Wi-Fi','AV System'], ARRAY['Standing','Theatre'], ARRAY['wheelchair-access','accessible-restrooms']),
('00000000-0000-4000-8000-000000000307', 'venue_staff1@connectsphere.test', 'Sample Cedar Boardroom', 'Central Campus, Block C', 12, 'Executive boardroom with video meeting support.',10,15, ARRAY['Video conferencing','Wired network','Whiteboard'], ARRAY['Boardroom'], ARRAY['elevator-access','hearing-loop']),
('00000000-0000-4000-8000-000000000308', 'venue_staff2@connectsphere.test', 'Sample Lagoon Event Lawn', 'Lakeside Campus, Outdoor', 1200, 'Open-air lawn for large community gatherings.',120,90, ARRAY['Power outlets','Stage','Parking'], ARRAY['Standing'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000309', 'venue_staff3@connectsphere.test', 'Sample Juniper Seminar Room', 'South Campus, Block D', 48, 'Seminar space with presentation facilities.',15,15, ARRAY['Projector','Wi-Fi','Lectern'], ARRAY['Seminar Room','Classroom'], ARRAY['accessible-restrooms','elevator-access']),
('00000000-0000-4000-8000-000000000310', 'venue_staff1@connectsphere.test', 'Sample Palm Dining Hall', 'Residence Commons, Level 1', 260, 'Dining hall suitable for catered events.',45,75, ARRAY['Catering','Power outlets'], ARRAY['Banquet','Cabaret'], ARRAY['wheelchair-access','accessible-restrooms']),
('00000000-0000-4000-8000-000000000311', 'venue_staff2@connectsphere.test', 'Sample Summit Collaboration Hub', 'Technology Park, Level 5', 72, 'Collaborative space with hybrid meeting equipment.',20,30, ARRAY['Video conferencing','Wi-Fi','AV System'], ARRAY['U-shape','Hollow square','Boardroom'], ARRAY['wheelchair-access','hearing-loop']),
('00000000-0000-4000-8000-000000000312', 'venue_staff3@connectsphere.test', 'Sample Coral Workshop Lab', 'Engineering Block, Level 2', 28, 'Workshop room for practical team activities.',30,30, ARRAY['Power outlets','Whiteboard'], ARRAY['Classroom','U-shape'], ARRAY['accessible-restrooms']),
('00000000-0000-4000-8000-000000000313', 'venue_staff1@connectsphere.test', 'Sample Meadow Conference Centre', 'Garden District, Building 4', 320, 'Conference venue with adjacent breakout rooms.',60,60, ARRAY['Catering','AV System','Wi-Fi','Parking'], ARRAY['Theatre','Classroom','Banquet'], ARRAY['wheelchair-access','accessible-restrooms','elevator-access']),
('00000000-0000-4000-8000-000000000314', 'venue_staff2@connectsphere.test', 'Sample Lantern Black Box', 'Performing Arts Centre, Studio 2', 95, 'Adaptable performance and rehearsal space.',75,45, ARRAY['Stage','AV System','Power outlets'], ARRAY['Theatre','Standing'], ARRAY['wheelchair-access','hearing-loop']),
('00000000-0000-4000-8000-000000000315', 'venue_staff3@connectsphere.test', 'Sample Pebble Interview Suite', 'Central Campus, Block E', 8, 'Quiet suite for interviews and private discussions.',5,10, ARRAY['Wired network','Video conferencing'], ARRAY['Boardroom'], ARRAY['elevator-access']),
('00000000-0000-4000-8000-000000000316', 'venue_staff1@connectsphere.test', 'Sample Rainforest Atrium', 'Library Building, Ground Floor', 500, 'Indoor atrium for fairs and public programmes.',60,45, ARRAY['Power outlets','Wi-Fi','Catering'], ARRAY['Standing','Cabaret'], ARRAY['wheelchair-access','accessible-restrooms']),
('00000000-0000-4000-8000-000000000317', 'venue_staff2@connectsphere.test', 'Sample Crescent Lecture Theatre', 'East Campus, Block F', 140, 'Lecture theatre with hearing assistance.',30,30, ARRAY['AV System','Lectern','Wired network'], ARRAY['Theatre'], ARRAY['hearing-loop','elevator-access']),
('00000000-0000-4000-8000-000000000318', 'venue_staff3@connectsphere.test', 'Sample Driftwood Beach Pavilion', 'Coastal Campus, Pavilion 1', 210, 'Covered pavilion for daytime and evening events.',45,45, ARRAY['Catering','Parking','Power outlets'], ARRAY['Banquet','Standing'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000319', 'venue_staff1@connectsphere.test', 'Sample Skyline Rooftop Terrace', 'Innovation Tower, Rooftop', 130, 'Outdoor terrace for receptions and networking.',45,60, ARRAY['Catering','AV System'], ARRAY['Cocktail','Standing'], ARRAY['elevator-access']),
('00000000-0000-4000-8000-000000000320', 'venue_staff2@connectsphere.test', 'Sample Willow Quiet Room', 'Wellbeing Centre, Level 1', 20, 'Low-stimulation room for small inclusive sessions.',10,20, ARRAY['Wi-Fi','Whiteboard'], ARRAY['Seminar Room','Boardroom'], ARRAY['wheelchair-access','accessible-restrooms']),
('00000000-0000-4000-8000-000000000321', 'venue_staff3@connectsphere.test', 'Sample Granite Expo Hall', 'Trade Centre, Hall 2', 1600, 'High-capacity hall for expos and conventions.',120,120, ARRAY['Stage','AV System','Power outlets','Parking'], ARRAY['Exhibition','Standing'], ARRAY['wheelchair-access','accessible-restrooms','elevator-access']),
('00000000-0000-4000-8000-000000000322', 'venue_staff1@connectsphere.test', 'Sample Poppy Music Room', 'Arts Quarter, Basement 1', 75, 'Rehearsal room with sound and lighting controls.',30,60, ARRAY['AV System','Power outlets'], ARRAY['Standing','Theatre'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000323', 'venue_staff2@connectsphere.test', 'Sample Cypress Training Suite', 'West Wing, Level 4', 64, 'Divisible suite for parallel training sessions.',30,30, ARRAY['Projector','Wi-Fi','Whiteboard'], ARRAY['Classroom','Cabaret','U-shape'], ARRAY['wheelchair-access','accessible-restrooms','hearing-loop']),
('00000000-0000-4000-8000-000000000324', 'venue_staff3@connectsphere.test', 'Sample Tidal Waterfront Room', 'Harbour Centre, Level 2', 105, 'Waterfront event room with flexible seating.',20,40, ARRAY['Catering','Video conferencing','Wi-Fi'], ARRAY['Banquet','Boardroom','Cabaret'], ARRAY['wheelchair-access','elevator-access']);

INSERT INTO venues (
    id, owner_user_id, name, location, capacity, operating_information,
    setup_time_minutes, turnaround_time_minutes
)
SELECT seed.id, owner.id, seed.name, seed.location, seed.capacity,
    seed.operating_information, seed.setup_time_minutes, seed.turnaround_time_minutes
FROM spm51_seed_venues seed
JOIN users owner ON owner.email = seed.owner_email
ON CONFLICT DO NOTHING;

-- Each sample venue gets its own small, labelled illustration. The artwork is
-- generated as SVG so it remains crisp in catalogue and detail views without
-- adding external image dependencies.
WITH image_styles (venue_id, accent, sky) AS (
    VALUES
    ('00000000-0000-4000-8000-000000000301'::uuid, '#4F83CC', '#DCEEFF'),
    ('00000000-0000-4000-8000-000000000302'::uuid, '#A36E4D', '#F6E9D9'),
    ('00000000-0000-4000-8000-000000000303'::uuid, '#B94F6A', '#F9E1E5'),
    ('00000000-0000-4000-8000-000000000304'::uuid, '#6552A3', '#E9E3FA'),
    ('00000000-0000-4000-8000-000000000305'::uuid, '#3F947C', '#DDF3EA'),
    ('00000000-0000-4000-8000-000000000306'::uuid, '#C27A3A', '#FBEBD8'),
    ('00000000-0000-4000-8000-000000000307'::uuid, '#557E65', '#E0F0E4'),
    ('00000000-0000-4000-8000-000000000308'::uuid, '#268A9A', '#D9F1F5'),
    ('00000000-0000-4000-8000-000000000309'::uuid, '#7B68A6', '#EEE8F8'),
    ('00000000-0000-4000-8000-000000000310'::uuid, '#BD6C47', '#F9E5D9'),
    ('00000000-0000-4000-8000-000000000311'::uuid, '#3F78A8', '#DFECF8'),
    ('00000000-0000-4000-8000-000000000312'::uuid, '#8A9B42', '#EEF2D8'),
    ('00000000-0000-4000-8000-000000000313'::uuid, '#4F927D', '#DDF1E8'),
    ('00000000-0000-4000-8000-000000000314'::uuid, '#B06F9D', '#F5E4F0'),
    ('00000000-0000-4000-8000-000000000315'::uuid, '#D0784D', '#FBE7DA'),
    ('00000000-0000-4000-8000-000000000316'::uuid, '#547E9A', '#E0EEF4'),
    ('00000000-0000-4000-8000-000000000317'::uuid, '#9A784A', '#F3EBD9'),
    ('00000000-0000-4000-8000-000000000318'::uuid, '#548C70', '#E1F0E4'),
    ('00000000-0000-4000-8000-000000000319'::uuid, '#8F638B', '#F1E5F0'),
    ('00000000-0000-4000-8000-000000000320'::uuid, '#B65D5D', '#F7E2DE'),
    ('00000000-0000-4000-8000-000000000321'::uuid, '#6D748B', '#E7EAF2'),
    ('00000000-0000-4000-8000-000000000322'::uuid, '#9C5D76', '#F4E3EB'),
    ('00000000-0000-4000-8000-000000000323'::uuid, '#4F8D91', '#DDF0F0'),
    ('00000000-0000-4000-8000-000000000324'::uuid, '#3D87A1', '#DCEFF5')
), image_art AS (
    SELECT seed.id AS venue_id,
        'sample-venue-' || right(seed.id::text, 3) || '.svg' AS file_name,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">' ||
        '<rect width="640" height="400" fill="' || style.sky || '"/>' ||
        '<circle cx="525" cy="70" r="34" fill="#FFFFFF" opacity="0.72"/>' ||
        '<path d="M0 274 Q130 235 255 276 T510 267 T640 270 V400 H0Z" fill="#B9D7C4"/>' ||
        '<path d="M92 164 320 73l228 91H92Z" fill="' || style.accent || '"/>' ||
        '<rect x="112" y="158" width="416" height="184" rx="8" fill="#FFFDF8" stroke="#34495E" stroke-width="5"/>' ||
        '<path d="M102 162h436" stroke="#34495E" stroke-width="8" stroke-linecap="round"/>' ||
        '<rect x="145" y="190" width="82" height="67" rx="6" fill="' || style.sky || '" stroke="' || style.accent || '" stroke-width="7"/>' ||
        '<path d="M186 190v67M145 224h82" stroke="#FFFFFF" stroke-width="5"/>' ||
        '<rect x="267" y="190" width="106" height="67" rx="6" fill="' || style.sky || '" stroke="' || style.accent || '" stroke-width="7"/>' ||
        '<path d="M320 190v67M267 224h106" stroke="#FFFFFF" stroke-width="5"/>' ||
        '<rect x="413" y="190" width="82" height="67" rx="6" fill="' || style.sky || '" stroke="' || style.accent || '" stroke-width="7"/>' ||
        '<path d="M454 190v67M413 224h82" stroke="#FFFFFF" stroke-width="5"/>' ||
        '<path d="M280 342v-61a40 40 0 0 1 80 0v61Z" fill="' || style.accent || '"/>' ||
        '<circle cx="347" cy="310" r="4" fill="#FFFDF8"/>' ||
        '<path d="M75 342h490" stroke="#728C70" stroke-width="9" stroke-linecap="round"/>' ||
        '<text x="320" y="378" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#263746">' || seed.name || '</text>' ||
        '<text x="320" y="143" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">CAPACITY ' || seed.capacity::text || '</text>' ||
        '</svg>' AS svg_markup
    FROM spm51_seed_venues seed
    JOIN image_styles style ON style.venue_id = seed.id
    JOIN venues venue ON venue.id = seed.id
)
INSERT INTO venue_images (venue_id, file_name, mime_type, byte_size, data_url)
SELECT venue_id, file_name, 'image/svg+xml',
    octet_length(convert_to(svg_markup, 'UTF8')),
    'data:image/svg+xml;base64,' || translate(
        encode(convert_to(svg_markup, 'UTF8'), 'base64'), E'\n\r', ''
    )
FROM image_art
ON CONFLICT (venue_id) DO NOTHING;

INSERT INTO venue_facilities (venue_id, facility_id)
SELECT seed.id, facility.id
FROM spm51_seed_venues seed
JOIN venues venue ON venue.id = seed.id
CROSS JOIN LATERAL unnest(seed.facilities) AS requested(name)
JOIN facilities facility ON facility.name = requested.name
ON CONFLICT DO NOTHING;

INSERT INTO venue_layouts (venue_id, layout_id)
SELECT seed.id, layout.id
FROM spm51_seed_venues seed
JOIN venues venue ON venue.id = seed.id
CROSS JOIN LATERAL unnest(seed.layouts) AS requested(name)
JOIN room_layouts layout ON layout.name = requested.name
ON CONFLICT DO NOTHING;

INSERT INTO venue_accessibility (venue_id, accessibility_id)
SELECT seed.id, feature.id
FROM spm51_seed_venues seed
JOIN venues venue ON venue.id = seed.id
CROSS JOIN LATERAL unnest(seed.accessibility) AS requested(id)
JOIN accessibility_features feature ON feature.id = requested.id
ON CONFLICT DO NOTHING;

COMMIT;

-- ===================================================================================================
-- SPM-113 equipment availability demo
-- ===================================================================================================

-- Local-only SPM-113 fixtures. These are idempotent and intentionally use
-- named demo records so they are easy to recognise in the Technical Support UI.
-- They do not implement SPM-58 review controls: the Reserved rows model the
-- outcome of an approved request solely to exercise availability checks.

INSERT INTO equipment (
    id, equipment_name, equipment_type, quantity, maintenance_status,
    active_quantity, under_maintenance_quantity, retired_quantity, location
) VALUES
    ('00000000-0000-4000-8000-000000000711', 'SPM-113 Demo Stage Lighting', 'Lighting', 15, 'Active', 10, 3, 2, 'AV Store'),
    ('00000000-0000-4000-8000-000000000712', 'SPM-113 Demo Wireless Microphones', 'Audio', 8, 'Active', 8, 0, 0, 'AV Store')
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT
    sample.id, organiser.id::text, organiser.display_name, organiser.email,
    sample.event_name, 'Local availability demonstration',
    'Development-only fixture for the equipment availability checker.',
    ((CURRENT_DATE + sample.start_day)::timestamp + sample.start_time) AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + sample.end_day)::timestamp + sample.end_time) AT TIME ZONE 'Asia/Singapore',
    40, 'Theatre', ARRAY['AV System']::text[], ARRAY[]::text[],
    'SPM-113 local equipment availability fixture.', false, 'Planning',
    coordinator.id::text, coordinator.display_name, sample.id
FROM (VALUES
    ('00000000-0000-4000-8000-000000000721'::uuid, 'SPM-113 Demo Evening Event', 7, '10:00'::time, 7, '12:00'::time),
    ('00000000-0000-4000-8000-000000000722'::uuid, 'SPM-113 Demo Microphone Event', 8, '14:00'::time, 8, '16:00'::time),
    ('00000000-0000-4000-8000-000000000723'::uuid, 'SPM-113 Demo Pending Review', 10, '09:00'::time, 10, '10:00'::time)
) AS sample(id, event_name, start_day, start_time, end_day, end_time)
JOIN users organiser ON organiser.email = 'organiser1@connectsphere.test'
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

INSERT INTO equipment_requests (id, event_id, requested_by, status)
SELECT sample.id, sample.event_id, coordinator.id, sample.status
FROM (VALUES
    ('00000000-0000-4000-8000-000000000731'::uuid, '00000000-0000-4000-8000-000000000721'::uuid, 'Reserved'),
    ('00000000-0000-4000-8000-000000000732'::uuid, '00000000-0000-4000-8000-000000000722'::uuid, 'Reserved'),
    ('00000000-0000-4000-8000-000000000733'::uuid, '00000000-0000-4000-8000-000000000723'::uuid, 'Pending Review')
) AS sample(id, event_id, status)
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

INSERT INTO equipment_request_items (id, request_id, equipment_name, equipment_type, quantity, item_order)
VALUES
    ('00000000-0000-4000-8000-000000000741', '00000000-0000-4000-8000-000000000731', 'SPM-113 Demo Stage Lighting', 'Lighting', 4, 0),
    ('00000000-0000-4000-8000-000000000742', '00000000-0000-4000-8000-000000000732', 'SPM-113 Demo Wireless Microphones', 'Audio', 2, 0),
    ('00000000-0000-4000-8000-000000000743', '00000000-0000-4000-8000-000000000733', 'SPM-113 Demo Stage Lighting', 'Lighting', 1, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO equipment_reservations (id, event_id, equipment_name, quantity, status, equipment_request_item_id)
VALUES
    ('00000000-0000-4000-8000-000000000751', '00000000-0000-4000-8000-000000000721', 'SPM-113 Demo Stage Lighting', 4, 'Reserved', '00000000-0000-4000-8000-000000000741'),
    ('00000000-0000-4000-8000-000000000752', '00000000-0000-4000-8000-000000000722', 'SPM-113 Demo Wireless Microphones', 2, 'Reserved', '00000000-0000-4000-8000-000000000742'),
    ('00000000-0000-4000-8000-000000000753', '00000000-0000-4000-8000-000000000723', 'SPM-113 Demo Stage Lighting', 1, 'Requested', '00000000-0000-4000-8000-000000000743')
ON CONFLICT (id) DO NOTHING;

-- ===================================================================================================
-- SPM-58 equipment review queue demo
-- ===================================================================================================

-- Local-only SPM-58 review-queue fixtures. Idempotent; named "SPM-58 Demo"
-- records are easy to recognise in the Technical Support UI.
--
-- SPM-58 (Review and reserve equipment requests) is not implemented yet. These
-- rows stand in for its data in two states:
--   1. 'Pending Review' requests an Event Coordinator raised on an approved
--      event, still awaiting Technical Support review (the queue's input).
--   2. 'Reserved' requests that Technical Support has already approved, each
--      with matching 'Reserved' equipment_reservations (the approved outcome).

-- Inventory the pending items can be reserved against once SPM-58 exists.
INSERT INTO equipment (
    id, equipment_name, equipment_type, quantity, maintenance_status,
    active_quantity, under_maintenance_quantity, retired_quantity, location
) VALUES
    ('00000000-0000-4000-8000-000000000760', 'SPM-58 Demo Projector', 'Visual', 6, 'Active', 6, 0, 0, 'AV Store'),
    ('00000000-0000-4000-8000-000000000761', 'SPM-58 Demo Folding Chairs', 'Furniture', 120, 'Active', 120, 0, 0, 'Main Store'),
    ('00000000-0000-4000-8000-000000000762', 'SPM-58 Demo PA Speaker', 'Audio', 10, 'Active', 8, 2, 0, 'AV Store')
ON CONFLICT (id) DO NOTHING;

-- Coordinator-approved events that each carry a pending equipment request.
INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT
    sample.id, organiser.id::text, organiser.display_name, organiser.email,
    sample.event_name, 'Local SPM-58 review-queue demonstration',
    'Development-only fixture for the equipment review and reserve queue.',
    ((CURRENT_DATE + sample.start_day)::timestamp + sample.start_time) AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + sample.end_day)::timestamp + sample.end_time) AT TIME ZONE 'Asia/Singapore',
    sample.attendance, 'Theatre', ARRAY['AV System']::text[], ARRAY[]::text[],
    sample.equipment_needs, false, 'Approved',
    coordinator.id::text, coordinator.display_name, sample.id
FROM (VALUES
    ('00000000-0000-4000-8000-000000000770'::uuid, 'SPM-58 Demo Orientation Briefing', 7, '09:00'::time, 7, '11:00'::time, 60, 'Projector and PA speaker for the welcome briefing.'),
    ('00000000-0000-4000-8000-000000000771'::uuid, 'SPM-58 Demo Faculty Seminar', 9, '13:00'::time, 9, '17:00'::time, 90, 'Seating and microphones for a half-day seminar.'),
    ('00000000-0000-4000-8000-000000000772'::uuid, 'SPM-58 Demo Sports Meet', 12, '08:00'::time, 12, '18:00'::time, 200, 'Stage lighting and a projector for the closing ceremony.')
) AS sample(id, event_name, start_day, start_time, end_day, end_time, attendance, equipment_needs)
JOIN users organiser ON organiser.email = 'organiser1@connectsphere.test'
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

-- Pending-review requests the Coordinator raised; these populate the queue.
INSERT INTO equipment_requests (id, event_id, requested_by, status)
SELECT sample.id, sample.event_id, coordinator.id, 'Pending Review'
FROM (VALUES
    ('00000000-0000-4000-8000-000000000780'::uuid, '00000000-0000-4000-8000-000000000770'::uuid),
    ('00000000-0000-4000-8000-000000000781'::uuid, '00000000-0000-4000-8000-000000000771'::uuid),
    ('00000000-0000-4000-8000-000000000782'::uuid, '00000000-0000-4000-8000-000000000772'::uuid)
) AS sample(id, event_id)
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

-- Requested items spanning several equipment types and quantities.
INSERT INTO equipment_request_items (id, request_id, equipment_name, equipment_type, quantity, item_order)
VALUES
    ('00000000-0000-4000-8000-000000000790', '00000000-0000-4000-8000-000000000780', 'SPM-58 Demo Projector', 'Visual', 2, 0),
    ('00000000-0000-4000-8000-000000000791', '00000000-0000-4000-8000-000000000780', 'SPM-58 Demo PA Speaker', 'Audio', 2, 1),
    ('00000000-0000-4000-8000-000000000792', '00000000-0000-4000-8000-000000000781', 'SPM-58 Demo Folding Chairs', 'Furniture', 80, 0),
    ('00000000-0000-4000-8000-000000000793', '00000000-0000-4000-8000-000000000781', 'SPM-58 Demo PA Speaker', 'Audio', 3, 1),
    ('00000000-0000-4000-8000-000000000794', '00000000-0000-4000-8000-000000000782', 'SPM-113 Demo Stage Lighting', 'Lighting', 5, 0),
    ('00000000-0000-4000-8000-000000000795', '00000000-0000-4000-8000-000000000782', 'SPM-58 Demo Projector', 'Visual', 1, 1)
ON CONFLICT (id) DO NOTHING;

-- Events whose requests Technical Support has already approved (Reserved).
INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT
    sample.id, organiser.id::text, organiser.display_name, organiser.email,
    sample.event_name, 'Local SPM-58 approved-request demonstration',
    'Development-only fixture for equipment requests approved by Technical Support.',
    ((CURRENT_DATE + sample.start_day)::timestamp + sample.start_time) AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + sample.end_day)::timestamp + sample.end_time) AT TIME ZONE 'Asia/Singapore',
    sample.attendance, 'Theatre', ARRAY['AV System']::text[], ARRAY[]::text[],
    sample.equipment_needs, false, 'Approved',
    coordinator.id::text, coordinator.display_name, sample.id
FROM (VALUES
    ('00000000-0000-4000-8000-000000000773'::uuid, 'SPM-58 Demo Approved Gala', 14, '18:00'::time, 14, '22:00'::time, 150, 'Projector and PA speaker reserved by Technical Support.'),
    ('00000000-0000-4000-8000-000000000774'::uuid, 'SPM-58 Demo Approved Workshop', 16, '09:00'::time, 16, '12:00'::time, 40, 'Folding chairs reserved by Technical Support.')
) AS sample(id, event_name, start_day, start_time, end_day, end_time, attendance, equipment_needs)
JOIN users organiser ON organiser.email = 'organiser1@connectsphere.test'
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

-- Requests Technical Support has approved: request status 'Reserved'.
INSERT INTO equipment_requests (id, event_id, requested_by, status)
SELECT sample.id, sample.event_id, coordinator.id, 'Reserved'
FROM (VALUES
    ('00000000-0000-4000-8000-000000000783'::uuid, '00000000-0000-4000-8000-000000000773'::uuid),
    ('00000000-0000-4000-8000-000000000784'::uuid, '00000000-0000-4000-8000-000000000774'::uuid)
) AS sample(id, event_id)
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

INSERT INTO equipment_request_items (id, request_id, equipment_name, equipment_type, quantity, item_order)
VALUES
    ('00000000-0000-4000-8000-000000000796', '00000000-0000-4000-8000-000000000783', 'SPM-58 Demo Projector', 'Visual', 2, 0),
    ('00000000-0000-4000-8000-000000000797', '00000000-0000-4000-8000-000000000783', 'SPM-58 Demo PA Speaker', 'Audio', 2, 1),
    ('00000000-0000-4000-8000-000000000798', '00000000-0000-4000-8000-000000000784', 'SPM-58 Demo Folding Chairs', 'Furniture', 40, 0)
ON CONFLICT (id) DO NOTHING;

-- Matching Reserved reservations record Technical Support's approval outcome.
INSERT INTO equipment_reservations (id, event_id, equipment_name, quantity, status, equipment_request_item_id)
VALUES
    ('00000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-000000000773', 'SPM-58 Demo Projector', 2, 'Reserved', '00000000-0000-4000-8000-000000000796'),
    ('00000000-0000-4000-8000-0000000007a2', '00000000-0000-4000-8000-000000000773', 'SPM-58 Demo PA Speaker', 2, 'Reserved', '00000000-0000-4000-8000-000000000797'),
    ('00000000-0000-4000-8000-0000000007a3', '00000000-0000-4000-8000-000000000774', 'SPM-58 Demo Folding Chairs', 40, 'Reserved', '00000000-0000-4000-8000-000000000798')
ON CONFLICT (id) DO NOTHING;

-- ===================================================================================================
-- SPM-54 venue suitability variants (VEN-BKG-01-B)
-- ===================================================================================================

-- SPM-54 VEN-BKG-01-B local manual-test fixtures.
-- Idempotent fixed IDs make each single-mismatch venue easy to select in the UI.
BEGIN;

CREATE TEMP TABLE spm54_suitability_venues (
    id uuid PRIMARY KEY,
    owner_email text NOT NULL,
    name varchar(200) NOT NULL,
    capacity integer NOT NULL,
    facilities text[] NOT NULL,
    layouts text[] NOT NULL,
    accessibility text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO spm54_suitability_venues VALUES
('00000000-0000-4000-8000-000000000325', 'venue_staff2@connectsphere.test', 'SPM-54 Test — Capacity 23', 23,
 ARRAY['Projector','Whiteboard','Wi-Fi'], ARRAY['Classroom','U-shape'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000326', 'venue_staff2@connectsphere.test', 'SPM-54 Test — No Projector', 36,
 ARRAY['Whiteboard','Wi-Fi'], ARRAY['Classroom','U-shape'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000327', 'venue_staff2@connectsphere.test', 'SPM-54 Test — No Wheelchair Access', 36,
 ARRAY['Projector','Whiteboard','Wi-Fi'], ARRAY['Classroom','U-shape'], ARRAY[]::text[]),
('00000000-0000-4000-8000-000000000328', 'venue_staff2@connectsphere.test', 'SPM-54 Test — No Classroom Layout', 36,
 ARRAY['Projector','Whiteboard','Wi-Fi'], ARRAY['U-shape'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000329', 'venue_staff2@connectsphere.test', 'SPM-54 Test — Capacity 24', 24,
 ARRAY['Projector','Whiteboard','Wi-Fi'], ARRAY['Classroom','U-shape'], ARRAY['wheelchair-access']);

INSERT INTO venues (
    id, owner_user_id, name, location, capacity, operating_information,
    setup_time_minutes, turnaround_time_minutes
)
SELECT seed.id, owner.id, seed.name, 'SPM-54 manual test fixtures', seed.capacity,
    'Local suitability test fixture.', 20, 20
FROM spm54_suitability_venues seed
JOIN users owner ON owner.email = seed.owner_email
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    location = EXCLUDED.location,
    capacity = EXCLUDED.capacity,
    operating_information = EXCLUDED.operating_information,
    setup_time_minutes = EXCLUDED.setup_time_minutes,
    turnaround_time_minutes = EXCLUDED.turnaround_time_minutes;

INSERT INTO venue_facilities (venue_id, facility_id)
SELECT seed.id, facility.id
FROM spm54_suitability_venues seed
CROSS JOIN LATERAL unnest(seed.facilities) AS requested(name)
JOIN facilities facility ON facility.name = requested.name
ON CONFLICT DO NOTHING;

INSERT INTO venue_layouts (venue_id, layout_id)
SELECT seed.id, layout.id
FROM spm54_suitability_venues seed
CROSS JOIN LATERAL unnest(seed.layouts) AS requested(name)
JOIN room_layouts layout ON layout.name = requested.name
ON CONFLICT DO NOTHING;

INSERT INTO venue_accessibility (venue_id, accessibility_id)
SELECT seed.id, feature.id
FROM spm54_suitability_venues seed
CROSS JOIN LATERAL unnest(seed.accessibility) AS requested(id)
JOIN accessibility_features feature ON feature.id = requested.id
ON CONFLICT DO NOTHING;

-- The wheelchair-accessibility variant has a matching event clone so its one
-- unmet requirement can be assessed without changing the shared EVT-201 row.
INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT '00000000-0000-4000-8000-000000000208'::uuid,
    source.organiser_id, source.organiser_name, source.organiser_email,
    'SPM-54 Test — Wheelchair Access Required', source.purpose,
    source.description, source.start_date_time, source.end_date_time,
    source.expected_attendance, source.preferred_room_layout,
    source.required_facilities, ARRAY['Wheelchair access']::text[],
    source.equipment_needs, source.registration_enabled, source.status,
    source.coordinator_id, source.coordinator_name,
    '00000000-0000-4000-8000-000000000208'::uuid
FROM events source
WHERE source.id = '00000000-0000-4000-8000-000000000201'::uuid
ON CONFLICT (id) DO UPDATE SET
    event_name = EXCLUDED.event_name,
    expected_attendance = EXCLUDED.expected_attendance,
    preferred_room_layout = EXCLUDED.preferred_room_layout,
    required_facilities = EXCLUDED.required_facilities,
    accessibility_needs = EXCLUDED.accessibility_needs,
    status = EXCLUDED.status,
    coordinator_id = EXCLUDED.coordinator_id,
    coordinator_name = EXCLUDED.coordinator_name;

COMMIT;

-- ===================================================================================================
-- SPM-57 equipment request test events
-- ===================================================================================================

-- Local development fixtures for SPM-57 equipment-request testing.
-- Coordinator 1 owns these future Approved events; neither has an equipment request.
-- The script is idempotent for fresh database initialization and manual local reapplication.

WITH coordinator AS (
    SELECT id::text AS id, display_name
    FROM users
    WHERE email = 'coordinator1@connectsphere.test'
), organiser AS (
    SELECT id::text AS id, display_name, email
    FROM users
    WHERE email = 'organiser1@connectsphere.test'
), fixtures AS (
    SELECT *
    FROM (VALUES
        ('00000000-0000-4000-8000-000000000157'::uuid, '00000000-0000-4000-8000-000000000157'::uuid, 'SPM-57 Equipment Form Test A', 'Test the equipment request form', 'Local testing fixture for an equipment request.', '2026-12-10 09:00:00+08'::timestamptz, '2026-12-10 12:00:00+08'::timestamptz, 40),
        ('00000000-0000-4000-8000-000000000158'::uuid, '00000000-0000-4000-8000-000000000158'::uuid, 'SPM-57 Equipment Form Test B', 'Test multiple equipment items', 'Local testing fixture for a second equipment request.', '2027-01-15 14:00:00+08'::timestamptz, '2027-01-15 17:00:00+08'::timestamptz, 75)
    ) AS value(id, submission_key, event_name, purpose, description, starts_at, ends_at, attendance)
), created AS (
    INSERT INTO events (
        id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
        start_date_time, end_date_time, expected_attendance, preferred_room_layout,
        coordinator_id, coordinator_name, status, submission_key
    )
    SELECT fixtures.id, organiser.id, organiser.display_name, organiser.email,
        fixtures.event_name, fixtures.purpose, fixtures.description,
        fixtures.starts_at, fixtures.ends_at, fixtures.attendance, 'Classroom',
        coordinator.id, coordinator.display_name, 'Approved', fixtures.submission_key
    FROM fixtures CROSS JOIN coordinator CROSS JOIN organiser
    ON CONFLICT (id) DO NOTHING
    RETURNING id, coordinator_id
)
INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id)
SELECT gen_random_uuid(), id, 'Submitted', 'Approved', coordinator_id
FROM created;

-- ===================================================================================================
-- SPM-56 manual conflict fixtures
-- ===================================================================================================

-- SPM-56 local manual-review fixture.
-- The pending ordinary request overlaps an approved booking, an active approved
-- tentative hold, and an unavailable period. Reruns refresh these fixed fixtures.
-- Clone seeded events so every event-linked booking has matching event times.
INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT
    '00000000-0000-4000-8000-000000005610'::uuid,
    source.organiser_id, source.organiser_name, source.organiser_email,
    'SPM-56 confirmed booking blocker', 'SPM-56 local test fixture',
    'Approved booking used to verify approval-time conflict detection.',
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '08:45') AT TIME ZONE 'Asia/Singapore',
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '09:15') AT TIME ZONE 'Asia/Singapore',
    source.expected_attendance, source.preferred_room_layout,
    source.required_facilities, source.accessibility_needs,
    source.equipment_needs, false, 'Approved', source.coordinator_id,
    source.coordinator_name, '00000000-0000-4000-8000-000000005610'::uuid
FROM events source
WHERE source.id = '00000000-0000-4000-8000-000000000201'::uuid
ON CONFLICT (id) DO UPDATE SET
    event_name = EXCLUDED.event_name, purpose = EXCLUDED.purpose,
    description = EXCLUDED.description,
    start_date_time = EXCLUDED.start_date_time,
    end_date_time = EXCLUDED.end_date_time,
    status = EXCLUDED.status;

INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT
    '00000000-0000-4000-8000-000000005611'::uuid,
    source.organiser_id, source.organiser_name, source.organiser_email,
    'SPM-56 active tentative hold blocker', 'SPM-56 local test fixture',
    'Approved tentative hold used to verify active-hold conflict detection.',
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '10:30') AT TIME ZONE 'Asia/Singapore',
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '12:00') AT TIME ZONE 'Asia/Singapore',
    source.expected_attendance, source.preferred_room_layout,
    source.required_facilities, source.accessibility_needs,
    source.equipment_needs, false, 'Approved', source.coordinator_id,
    source.coordinator_name, '00000000-0000-4000-8000-000000005611'::uuid
FROM events source
WHERE source.id = '00000000-0000-4000-8000-000000000203'::uuid
ON CONFLICT (id) DO UPDATE SET
    event_name = EXCLUDED.event_name, purpose = EXCLUDED.purpose,
    description = EXCLUDED.description,
    start_date_time = EXCLUDED.start_date_time,
    end_date_time = EXCLUDED.end_date_time,
    status = EXCLUDED.status;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status, request_kind,
    hold_expires_at, special_request
)
SELECT
    '00000000-0000-4000-8000-000000005601'::uuid,
    venue.id,
    '00000000-0000-4000-8000-000000000202'::uuid,
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '10:00') AT TIME ZONE 'Asia/Singapore',
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '13:00') AT TIME ZONE 'Asia/Singapore',
    'pending', 'booking', NULL,
    'SPM-56 demo request: approve to review the conflict details.'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO UPDATE SET
  venue_id = EXCLUDED.venue_id, event_id = EXCLUDED.event_id,
  start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at,
  status = EXCLUDED.status, request_kind = EXCLUDED.request_kind,
  hold_expires_at = EXCLUDED.hold_expires_at,
  special_request = EXCLUDED.special_request;

INSERT INTO venue_booking_requests (event_id, venue_id, special_request)
SELECT '00000000-0000-4000-8000-000000000202'::uuid, venue.id,
       'SPM-56 demo request: approve to review the conflict details.'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (event_id, venue_id) DO UPDATE
  SET special_request = EXCLUDED.special_request;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status, request_kind
)
SELECT
    '00000000-0000-4000-8000-000000005602'::uuid,
    venue.id,
    '00000000-0000-4000-8000-000000005610'::uuid,
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '08:45') AT TIME ZONE 'Asia/Singapore',
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '09:15') AT TIME ZONE 'Asia/Singapore',
    'approved', 'booking'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO UPDATE SET
  venue_id = EXCLUDED.venue_id, event_id = EXCLUDED.event_id,
  start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at,
  status = EXCLUDED.status, request_kind = EXCLUDED.request_kind;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at
)
SELECT
    '00000000-0000-4000-8000-000000005603'::uuid,
    venue.id,
    '00000000-0000-4000-8000-000000005611'::uuid,
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '10:30') AT TIME ZONE 'Asia/Singapore',
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '12:00') AT TIME ZONE 'Asia/Singapore',
    'approved', 'tentative_hold', now() + INTERVAL '1 day'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO UPDATE SET
  venue_id = EXCLUDED.venue_id, event_id = EXCLUDED.event_id,
  start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at,
  status = EXCLUDED.status, request_kind = EXCLUDED.request_kind,
  hold_expires_at = EXCLUDED.hold_expires_at;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status, reason
)
SELECT
    '00000000-0000-4000-8000-000000005604'::uuid,
    venue.id,
    NULL,
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '10:45') AT TIME ZONE 'Asia/Singapore',
    (((now() AT TIME ZONE 'Asia/Singapore')::date + 21)::timestamp + TIME '11:15') AT TIME ZONE 'Asia/Singapore',
    'blocked', 'SPM-56 demo unavailable period'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO UPDATE SET
  venue_id = EXCLUDED.venue_id, start_at = EXCLUDED.start_at,
  end_at = EXCLUDED.end_at, status = EXCLUDED.status,
  reason = EXCLUDED.reason;


-- Every blocked period gets its 'created' history entry, with the person not recorded.
INSERT INTO venue_unavailability_history
    (venue_id, period_id, action, start_at, end_at, reason, actor_user_id, created_at)
SELECT b.venue_id, b.id, 'created', b.start_at, b.end_at, b.reason, NULL, b.created_at
  FROM venue_bookings b
 WHERE b.status = 'blocked'
   AND NOT EXISTS (
       SELECT 1 FROM venue_unavailability_history h
        WHERE h.period_id = b.id AND h.action = 'created');


-- ===================================================================================================
-- SPM-131 safety outcome workflow demo
-- ===================================================================================================

-- SPM-131 local-only workflow fixtures. Idempotent: existing demo progress is preserved.
-- These events begin in Planning with approved venue/equipment arrangements and a pending
-- safety check so they can be used for approval, requested-changes, and rejection flows.

INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT fixture.id, organiser.id::text, organiser.display_name, organiser.email,
    fixture.event_name, 'SPM-131 safety outcome workflow demonstration',
    'Local fixture for testing Safety Officer approval, requested changes, and rejection.',
    fixture.start_at, fixture.end_at, 80, 'Theatre', ARRAY['AV System']::text[],
    ARRAY[]::text[], 'SPM-58 Demo Projector x1', false, 'Planning',
    coordinator.id::text, coordinator.display_name, fixture.id
FROM (VALUES
    ('00000000-0000-4000-8000-000000131004'::uuid, 'SPM-131 Demo 4 - Safety Approval',  '2027-06-10 10:00:00+08'::timestamptz, '2027-06-10 12:00:00+08'::timestamptz),
    ('00000000-0000-4000-8000-000000131005'::uuid, 'SPM-131 Demo 5 - Request Changes', '2027-06-11 10:00:00+08'::timestamptz, '2027-06-11 12:00:00+08'::timestamptz),
    ('00000000-0000-4000-8000-000000131006'::uuid, 'SPM-131 Demo 6 - Safety Rejection', '2027-06-12 10:00:00+08'::timestamptz, '2027-06-12 12:00:00+08'::timestamptz)
) AS fixture(id, event_name, start_at, end_at)
JOIN users organiser ON organiser.email = 'organiser1@connectsphere.test'
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

INSERT INTO venue_bookings (id, venue_id, event_id, start_at, end_at, status)
VALUES
    ('00000000-0000-4000-8000-000000131104', '00000000-0000-4000-8000-000000000124', '00000000-0000-4000-8000-000000131004', '2027-06-10 10:00:00+08', '2027-06-10 12:00:00+08', 'approved'),
    ('00000000-0000-4000-8000-000000131105', '00000000-0000-4000-8000-000000000124', '00000000-0000-4000-8000-000000131005', '2027-06-11 10:00:00+08', '2027-06-11 12:00:00+08', 'approved'),
    ('00000000-0000-4000-8000-000000131106', '00000000-0000-4000-8000-000000000124', '00000000-0000-4000-8000-000000131006', '2027-06-12 10:00:00+08', '2027-06-12 12:00:00+08', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO equipment_requests (id, event_id, requested_by, status)
SELECT fixture.request_id, fixture.event_id, coordinator.id, 'Reserved'
FROM (VALUES
    ('00000000-0000-4000-8000-000000131204'::uuid, '00000000-0000-4000-8000-000000131004'::uuid),
    ('00000000-0000-4000-8000-000000131205'::uuid, '00000000-0000-4000-8000-000000131005'::uuid),
    ('00000000-0000-4000-8000-000000131206'::uuid, '00000000-0000-4000-8000-000000131006'::uuid)
) AS fixture(request_id, event_id)
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

INSERT INTO equipment_request_items (id, request_id, equipment_name, equipment_type, quantity, item_order)
VALUES
    ('00000000-0000-4000-8000-000000131304', '00000000-0000-4000-8000-000000131204', 'SPM-58 Demo Projector', 'Visual', 1, 0),
    ('00000000-0000-4000-8000-000000131305', '00000000-0000-4000-8000-000000131205', 'SPM-58 Demo Projector', 'Visual', 1, 0),
    ('00000000-0000-4000-8000-000000131306', '00000000-0000-4000-8000-000000131206', 'SPM-58 Demo Projector', 'Visual', 1, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO equipment_reservations (id, event_id, equipment_name, quantity, status, equipment_request_item_id)
VALUES
    ('00000000-0000-4000-8000-000000131404', '00000000-0000-4000-8000-000000131004', 'SPM-58 Demo Projector', 1, 'Reserved', '00000000-0000-4000-8000-000000131304'),
    ('00000000-0000-4000-8000-000000131405', '00000000-0000-4000-8000-000000131005', 'SPM-58 Demo Projector', 1, 'Reserved', '00000000-0000-4000-8000-000000131305'),
    ('00000000-0000-4000-8000-000000131406', '00000000-0000-4000-8000-000000131006', 'SPM-58 Demo Projector', 1, 'Reserved', '00000000-0000-4000-8000-000000131306')
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
SELECT fixture.event_id, 'pending', now(), coordinator.id::text
FROM (VALUES
    ('00000000-0000-4000-8000-000000131004'::uuid),
    ('00000000-0000-4000-8000-000000131005'::uuid),
    ('00000000-0000-4000-8000-000000131006'::uuid)
) AS fixture(event_id)
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (event_id) DO NOTHING;

-- ===================================================================================================
-- SPM-149 coordinator sample events
-- ===================================================================================================

-- SPM-149 local sample events for the Event Coordinator accounts, with statuses that match
-- their venue bookings, equipment and safety state (SPM-135 readiness rule).
-- Idempotent: ON CONFLICT DO NOTHING keeps local edits. Dates are relative to the current date
-- and start 50 days out, so the SPM-51/52 availability windows (days 7 to 42) stay free.
--
-- Order matters on a database that already has the triggers (003_functions_triggers.sql): venue bookings
-- and equipment reservations clear the event's safety check, so the safety rows are inserted last. The
-- order is kept so repeating this file against an initialised database behaves the same way.
--
-- Accounts: coordinator1, coordinator2, coordinator3 and coordinator_venuestaff own events.
-- The Coordinator Lead owns none. Submitted events 401 and 402 are left unassigned for the Lead queue.

-- Events. Only Submitted, Approved, Planning, Confirmed and Rejected are seeded
-- (Completed and Cancelled are not implemented).
INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, rejection_reason,
    coordinator_id, coordinator_name, submission_key, equipment_confirmed_at
)
SELECT sample.id, organiser.id::text, organiser.display_name, organiser.email,
    sample.event_name, sample.purpose, sample.description,
    ((CURRENT_DATE + sample.start_day)::timestamp + sample.start_time)
        AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + sample.end_day)::timestamp + sample.end_time)
        AT TIME ZONE 'Asia/Singapore',
    sample.expected_attendance, sample.room_layout, sample.facilities,
    sample.accessibility, sample.equipment, sample.registration_enabled,
    sample.status, sample.rejection_reason,
    coordinator.id::text, coordinator.display_name, sample.id,
    CASE WHEN sample.no_equipment_needed THEN now() - interval '2 days' END
FROM (VALUES
    ('00000000-0000-4000-8000-000000000401'::uuid, 'SPM-149 Seed: Submitted - unassigned for the Lead queue',
        'Campus open day briefing', 'Briefing for prospective students.', 50, '09:00'::time, 50, '11:00'::time,
        60, 'Classroom', ARRAY['Projector']::text[], ARRAY[]::text[], 'Projector and handouts.', false,
        'Submitted', NULL, NULL, false, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000402'::uuid, 'SPM-149 Seed: Submitted - unassigned for the Lead queue',
        'Peer mentoring kickoff', 'Kick off the mentoring programme for first-year students.', 55, '13:00'::time, 55, '15:00'::time,
        90, 'Theatre', ARRAY['AV System']::text[], ARRAY['Wheelchair access']::text[], 'Two microphones.', true,
        'Submitted', NULL, NULL, false, 'organiser2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000403'::uuid, 'SPM-149 Seed: Submitted - assigned, awaiting review',
        'Research poster session', 'Showcase final-year research posters.', 52, '10:00'::time, 52, '12:00'::time,
        120, 'Exhibition', ARRAY['Power outlets']::text[], ARRAY['Accessible restrooms']::text[], 'Poster boards.', true,
        'Submitted', NULL, 'coordinator1@connectsphere.test', false, 'organiser3@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000404'::uuid, 'SPM-149 Seed: Submitted - assigned, awaiting review',
        'Careers fair preview', 'Preview session for the upcoming careers fair.', 58, '09:30'::time, 58, '11:30'::time,
        150, 'Theatre', ARRAY['AV System', 'Wi-Fi']::text[], ARRAY['Wheelchair access']::text[], 'Presentation screen.', true,
        'Submitted', NULL, 'coordinator_venuestaff@connectsphere.test', false, 'organiser2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000405'::uuid, 'SPM-149 Seed: Approved - no venue or equipment requested yet',
        'Writing workshop', 'Creative writing workshop for students.', 60, '14:00'::time, 60, '16:00'::time,
        30, 'Classroom', ARRAY['Whiteboard']::text[], ARRAY[]::text[], 'Whiteboard markers.', false,
        'Approved', NULL, 'coordinator1@connectsphere.test', false, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000406'::uuid, 'SPM-149 Seed: Approved - no venue or equipment requested yet',
        'Hackathon briefing', 'Briefing before a student hackathon.', 62, '18:00'::time, 62, '19:30'::time,
        70, 'Theatre', ARRAY['Wi-Fi']::text[], ARRAY[]::text[], 'Laptops are supplied by participants.', true,
        'Approved', NULL, 'coordinator2@connectsphere.test', false, 'organiser3@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000407'::uuid, 'SPM-149 Seed: Planning - venue approved, equipment and safety outstanding',
        'Leadership panel', 'Panel discussion with alumni leaders.', 64, '09:00'::time, 64, '12:00'::time,
        160, 'Theatre', ARRAY['AV System']::text[], ARRAY['Wheelchair access']::text[], 'Panel microphones.', true,
        'Planning', NULL, 'coordinator1@connectsphere.test', false, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000408'::uuid, 'SPM-149 Seed: Planning - venue request pending, safety awaiting check',
        'Industry networking lunch', 'Lunch networking with industry partners.', 66, '12:00'::time, 66, '14:00'::time,
        200, 'Banquet', ARRAY['Catering']::text[], ARRAY['Accessible restrooms']::text[], 'Lectern and microphone.', false,
        'Planning', NULL, 'coordinator2@connectsphere.test', false, 'organiser2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000409'::uuid, 'SPM-149 Seed: Confirmed - venue, equipment and safety all ready',
        'Engineering design showcase', 'Showcase of capstone design projects.', 68, '10:00'::time, 68, '16:00'::time,
        250, 'Exhibition', ARRAY['Power outlets', 'Wi-Fi']::text[], ARRAY['Wheelchair access']::text[],
        'Two wireless microphones.', true, 'Confirmed', NULL, 'coordinator1@connectsphere.test', false, 'organiser3@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000410'::uuid, 'SPM-149 Seed: Confirmed - venue and safety ready, no equipment needed',
        'Graduate reflection talk', 'Short talks by recent graduates.', 70, '09:00'::time, 70, '12:00'::time,
        100, 'Seminar Room', ARRAY['Projector']::text[], ARRAY[]::text[], 'None needed.', false,
        'Confirmed', NULL, 'coordinator3@connectsphere.test', true, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000411'::uuid, 'SPM-149 Seed: Confirmed - venue, equipment and safety all ready',
        'Robotics open house', 'Demonstrations of student robotics projects.', 72, '13:00'::time, 72, '17:00'::time,
        110, 'Exhibition', ARRAY['AV System']::text[], ARRAY['Accessible restrooms']::text[], 'One projector.', true,
        'Confirmed', NULL, 'coordinator_venuestaff@connectsphere.test', false, 'organiser2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000412'::uuid, 'SPM-149 Seed: Rejected - venue request declined',
        'Dining hall pop-up', 'Pop-up event with student food stalls.', 74, '12:00'::time, 74, '14:00'::time,
        180, 'Banquet', ARRAY['Catering']::text[], ARRAY[]::text[], 'Serving tables.', false,
        'Rejected', 'The requested venue is unavailable for the required event duration.',
        'coordinator2@connectsphere.test', false, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000413'::uuid, 'SPM-149 Seed: Rejected - safety arrangements not approved',
        'Rooftop music night', 'Evening music performances on the rooftop.', 76, '18:00'::time, 76, '21:00'::time,
        95, 'Cocktail', ARRAY['AV System']::text[], ARRAY[]::text[], 'Speakers and stage lighting.', true,
        'Rejected', 'The Safety Officer did not approve the planned arrangements.',
        'coordinator3@connectsphere.test', false, 'organiser3@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000414'::uuid, 'SPM-149 Seed: Approved - no venue or equipment requested yet',
        'Study skills clinic', 'Drop-in study skills sessions.', 78, '10:00'::time, 78, '12:00'::time,
        40, 'Classroom', ARRAY[]::text[], ARRAY[]::text[], 'None needed.', false,
        'Approved', NULL, 'coordinator3@connectsphere.test', false, 'organiser2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000415'::uuid, 'SPM-149 Seed: Submitted - assigned, awaiting review',
        'Alumni homecoming dinner', 'Dinner for returning alumni.', 80, '19:00'::time, 80, '22:00'::time,
        140, 'Banquet', ARRAY['Catering', 'AV System']::text[], ARRAY['Wheelchair access']::text[], 'Microphone for speeches.', true,
        'Submitted', NULL, 'coordinator3@connectsphere.test', false, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000416'::uuid, 'SPM-149 Seed: Planning - equipment requested, reservation pending',
        'Coding bootcamp', 'Hands-on coding bootcamp for students.', 82, '09:00'::time, 82, '11:00'::time,
        45, 'Classroom', ARRAY['Wi-Fi']::text[], ARRAY[]::text[], 'Portable speaker for demos.', false,
        'Planning', NULL, 'coordinator3@connectsphere.test', false, 'organiser2@connectsphere.test')
) AS sample(
    id, event_name, purpose, description, start_day, start_time, end_day, end_time,
    expected_attendance, room_layout, facilities, accessibility, equipment,
    registration_enabled, status, rejection_reason, coordinator_email, no_equipment_needed, organiser_email
)
JOIN users organiser ON organiser.email = sample.organiser_email
LEFT JOIN users coordinator ON coordinator.email = sample.coordinator_email
ON CONFLICT (id) DO NOTHING;

-- Venue bookings. Approved bookings back Planning and Confirmed events; a pending one is a
-- venue request still awaiting a decision; a rejected one explains a Rejected event.
-- Venues are the seeded sample venues 301 to 317 (Cedar Studio 125 is kept clear of these windows).
INSERT INTO venue_bookings (id, venue_id, event_id, start_at, end_at, status, reason, hold_expires_at)
SELECT b.id, b.venue_id, e.id,
    ((CURRENT_DATE + b.start_day)::timestamp + b.start_time) AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + b.start_day)::timestamp + b.end_time) AT TIME ZONE 'Asia/Singapore',
    b.status, NULL, NULL
FROM (VALUES
    ('00000000-0000-4000-8000-000000000501'::uuid, '00000000-0000-4000-8000-000000000301'::uuid,
        '00000000-0000-4000-8000-000000000407'::uuid, 64, '09:00'::time, '12:00'::time, 'approved'),
    ('00000000-0000-4000-8000-000000000502'::uuid, '00000000-0000-4000-8000-000000000303'::uuid,
        '00000000-0000-4000-8000-000000000408'::uuid, 66, '12:00'::time, '14:00'::time, 'pending'),
    ('00000000-0000-4000-8000-000000000503'::uuid, '00000000-0000-4000-8000-000000000313'::uuid,
        '00000000-0000-4000-8000-000000000409'::uuid, 68, '10:00'::time, '16:00'::time, 'approved'),
    ('00000000-0000-4000-8000-000000000504'::uuid, '00000000-0000-4000-8000-000000000316'::uuid,
        '00000000-0000-4000-8000-000000000410'::uuid, 70, '09:00'::time, '12:00'::time, 'approved'),
    ('00000000-0000-4000-8000-000000000505'::uuid, '00000000-0000-4000-8000-000000000317'::uuid,
        '00000000-0000-4000-8000-000000000411'::uuid, 72, '13:00'::time, '17:00'::time, 'approved'),
    ('00000000-0000-4000-8000-000000000506'::uuid, '00000000-0000-4000-8000-000000000310'::uuid,
        '00000000-0000-4000-8000-000000000412'::uuid, 74, '12:00'::time, '14:00'::time, 'rejected'),
    ('00000000-0000-4000-8000-000000000507'::uuid, '00000000-0000-4000-8000-000000000309'::uuid,
        '00000000-0000-4000-8000-000000000416'::uuid, 82, '09:00'::time, '11:00'::time, 'approved')
) AS b(id, venue_id, event_id, start_day, start_time, end_time, status)
JOIN venues v ON v.id = b.venue_id
JOIN events e ON e.id = b.event_id
ON CONFLICT (id) DO NOTHING;

-- Equipment reservations. Reserved lines satisfy the readiness rule; a Requested line does not.
INSERT INTO equipment_reservations (id, event_id, equipment_name, quantity, status)
VALUES
    ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000409', 'Wireless microphone', 2, 'Reserved'),
    ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000411', 'Projector 4K', 1, 'Reserved'),
    ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000416', 'Portable speaker', 1, 'Requested')
ON CONFLICT (id) DO NOTHING;

-- Safety checks go last: the venue and equipment triggers above clear a safety row when they change.
-- Confirmed events 409, 410 and 411 have an approved check. Event 408 is awaiting a check.
-- Event 407 has none, so its safety item stays outstanding.
INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, feedback, decided_at)
VALUES
    ('00000000-0000-4000-8000-000000000409', 'approved', now() - interval '5 days',
        'coordinator1@connectsphere.test', 'Safety Officer 1', NULL, now() - interval '4 days'),
    ('00000000-0000-4000-8000-000000000410', 'approved', now() - interval '5 days',
        'coordinator3@connectsphere.test', 'Safety Officer 2', NULL, now() - interval '4 days'),
    ('00000000-0000-4000-8000-000000000411', 'approved', now() - interval '5 days',
        'coordinator_venuestaff@connectsphere.test', 'Safety Officer 1', NULL, now() - interval '4 days'),
    ('00000000-0000-4000-8000-000000000408', 'pending', now() - interval '1 day',
        'coordinator2@connectsphere.test', NULL, NULL, NULL)
ON CONFLICT (event_id) DO NOTHING;

-- Organiser 1's one development draft.
INSERT INTO event_drafts (id, organiser_id, fields)
SELECT '00000000-0000-4000-8000-000000000451'::uuid, u.id::text,
    jsonb_build_object(
        -- 'name', not 'eventName': this is read as DraftFields, which the create page and
        -- My Drafts both key by name. The old key left this row without one, and My Drafts
        -- threw while rendering it.
        'name', 'SPM-149 Seed: Draft - not yet submitted',
        'purpose', 'Draft for organiser testing.',
        'description', 'Saved draft that has not been submitted to a coordinator.',
        'expectedAttendance', '25'
    )
FROM users u WHERE u.email = 'organiser1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;
