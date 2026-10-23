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
