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
