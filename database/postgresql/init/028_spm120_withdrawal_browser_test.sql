-- SPM-120 withdrawal browser test seed: a full event (capacity 2, 2 registrations).
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE keeps reruns safe.
-- Seeded only for the Playwright withdrawal spec; data is fictional and for local dev only.

INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email,
    event_name, purpose, description,
    start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, registration_limit, status,
    coordinator_id, coordinator_name, submission_key
)
SELECT
    '00000000-0000-4000-8000-000000000120'::uuid,
    u.id::text,
    u.display_name,
    u.email,
    'SPM-120 withdrawal browser',
    'Registration withdrawal E2E test',
    'Fictional event seeded for the Playwright withdrawal smoke test.',
    ((CURRENT_DATE + 30)::timestamp + '10:00:00'::time) AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 30)::timestamp + '12:00:00'::time) AT TIME ZONE 'Asia/Singapore',
    2,
    'Banquet',
    ARRAY[]::text[],
    ARRAY[]::text[],
    '',
    true,
    2,
    'Confirmed',
    c.id::text,
    c.display_name,
    '00000000-0000-4000-8000-000000000120'::uuid
FROM users u
JOIN users c ON c.email = 'coordinator1@connectsphere.test'
WHERE u.email = 'organiser1@connectsphere.test'
ON CONFLICT (id) DO NOTHING;

-- Register both attendees so the event is at full capacity.
INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email)
SELECT
    '00000000-0000-4000-8000-000000000120'::uuid,
    u.id,
    'Registered',
    u.display_name,
    u.email
FROM users u
WHERE u.email IN (
    'attendee1@connectsphere.test',
    'attendee2@connectsphere.test'
)
ON CONFLICT (event_id, attendee_id) DO UPDATE
    SET status = 'Registered', withdrawn_at = NULL;
