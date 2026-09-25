-- Local-only, idempotent development seed data. Passwords are not production credentials.
INSERT INTO app_health_checks (source) SELECT 'compose-init' WHERE NOT EXISTS (SELECT 1 FROM app_health_checks WHERE source = 'compose-init');

INSERT INTO roles (id, name, description) VALUES
    (1, 'ORGANISER', 'Creates and manages event requests, including drafts and change requests, and views relevant event and registration information.'),
    (2, 'COORDINATOR', 'Reviews and coordinates events, manages approvals, venue bookings, equipment requirements, and event changes.'),
    (3, 'VENUE_STAFF', 'Manages venue-related information and reviews venue booking requests, including approving or rejecting bookings.'),
    (4, 'TECH_SUPPORT', 'Manages equipment-related requests, checks equipment availability, and handles equipment reservations for events.'),
    (5, 'ATTENDEE', 'Views appropriate event information, registers for events, checks registration status, and withdraws registrations.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO resources (id, name, description) VALUES
    (1, 'Event', 'Represents an event and its core information, including event details, requirements, organiser, assigned coordinator, and current status.'),
    (2, 'Event Review', 'Represents the coordinator-side review of a submitted event, including clarification requests and approval or rejection decisions.'),
    (3, 'Event Change Request', 'Represents a request by an organiser to change important information of an already-submitted event and the subsequent processing of that request.'),
    (4, 'Venue', 'Represents a physical venue and its relatively static information, such as location, capacity, facilities, accessibility, layouts, and operating information.'),
    (5, 'Venue Unavailability', 'Represents manually recorded periods when a venue cannot be used, such as maintenance or closure. Venue availability itself is derived from these periods together with existing bookings.'),
    (6, 'Venue Booking', 'Represents the reservation/request to use a particular venue for an event during a specified period, including its pending, approved, or rejected state.'),
    (7, 'Equipment Request', 'Represents the equipment requirements requested for an event, including equipment type, quantity, and technical requirements.'),
    (8, 'Equipment Reservation', 'Represents equipment allocated or reserved for a particular event and time period.'),
    (9, 'Attendee Registration', 'Represents an attendee''s registration for an event, including their registration status and withdrawal.'),
    (10, 'Notification', 'Represents a notification delivered to a user about relevant event-related activity, such as approvals, changes, bookings, or cancellations.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, resource_id, "create", "read", "update", "delete") VALUES
    (1, 1, true, true, true, false), (2, 1, false, true, true, false), (3, 1, false, true, false, false), (4, 1, false, true, false, false), (5, 1, false, true, false, false),
    (1, 2, false, true, false, false), (2, 2, true, true, true, false), (1, 3, true, true, false, false), (2, 3, false, true, true, false), (2, 4, false, true, false, false),
    (3, 4, true, true, true, false), (2, 5, false, true, false, false), (3, 5, true, true, true, true), (2, 6, true, true, true, false), (3, 6, false, true, true, false),
    (2, 7, true, true, true, false), (4, 7, false, true, true, false), (2, 8, false, true, false, false), (4, 8, true, true, true, true), (1, 9, false, true, false, false),
    (2, 9, false, true, false, false), (5, 9, true, true, false, true), (1, 10, false, true, false, false), (2, 10, false, true, false, false), (3, 10, false, true, false, false),
    (4, 10, false, true, false, false), (5, 10, false, true, false, false)
ON CONFLICT (role_id, resource_id) DO UPDATE SET "create" = EXCLUDED."create", "read" = EXCLUDED."read", "update" = EXCLUDED."update", "delete" = EXCLUDED."delete";

INSERT INTO users (email, display_name, password_hash) VALUES
    ('organiser1@connectsphere.test', 'Organiser 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('organiser2@connectsphere.test', 'Organiser 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('organiser3@connectsphere.test', 'Organiser 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('coordinator1@connectsphere.test', 'Coordinator 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('coordinator2@connectsphere.test', 'Coordinator 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('coordinator3@connectsphere.test', 'Coordinator 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('venue_staff1@connectsphere.test', 'Venue Staff 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('venue_staff2@connectsphere.test', 'Venue Staff 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('venue_staff3@connectsphere.test', 'Venue Staff 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('tech_support1@connectsphere.test', 'Tech Support 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('tech_support2@connectsphere.test', 'Tech Support 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('tech_support3@connectsphere.test', 'Tech Support 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('attendee1@connectsphere.test', 'Attendee 1', crypt('P@55w0rd', gen_salt('bf', 12))), ('attendee2@connectsphere.test', 'Attendee 2', crypt('P@55w0rd', gen_salt('bf', 12))), ('attendee3@connectsphere.test', 'Attendee 3', crypt('P@55w0rd', gen_salt('bf', 12))),
    ('coordinator_venuestaff@connectsphere.test', 'Coor_Venue', crypt('P@55w0rd', gen_salt('bf', 12)))
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true, updated_at = now();

INSERT INTO user_roles (user_id, role_id)
SELECT users.id, roles.id FROM (VALUES
    ('organiser1@connectsphere.test', 'ORGANISER'), ('organiser2@connectsphere.test', 'ORGANISER'), ('organiser3@connectsphere.test', 'ORGANISER'),
    ('coordinator1@connectsphere.test', 'COORDINATOR'), ('coordinator2@connectsphere.test', 'COORDINATOR'), ('coordinator3@connectsphere.test', 'COORDINATOR'),
    ('venue_staff1@connectsphere.test', 'VENUE_STAFF'), ('venue_staff2@connectsphere.test', 'VENUE_STAFF'), ('venue_staff3@connectsphere.test', 'VENUE_STAFF'),
    ('tech_support1@connectsphere.test', 'TECH_SUPPORT'), ('tech_support2@connectsphere.test', 'TECH_SUPPORT'), ('tech_support3@connectsphere.test', 'TECH_SUPPORT'),
    ('attendee1@connectsphere.test', 'ATTENDEE'), ('attendee2@connectsphere.test', 'ATTENDEE'), ('attendee3@connectsphere.test', 'ATTENDEE'),
    ('organiser_coordinator@connectsphere.test', 'COORDINATOR'), ('organiser_coordinator@connectsphere.test', 'VENUE_STAFF')
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
