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
