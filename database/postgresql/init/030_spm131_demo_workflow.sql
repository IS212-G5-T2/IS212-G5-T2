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
