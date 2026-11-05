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

-- The event is Confirmed, so it must meet the SPM-135 readiness rule (see 036 for the order).
-- Venue booking, equipment confirmation and safety approval are inserted after the event exists.
-- Venue 301 is the seeded Sample Birch Lecture Hall; the window is the event's own 10:00 to 12:00.
INSERT INTO venue_bookings (id, venue_id, event_id, start_at, end_at, status, reason, hold_expires_at)
SELECT '00000000-0000-4000-8000-000000000121'::uuid, v.id, e.id, e.start_date_time, e.end_date_time,
    'approved', NULL, NULL
FROM events e
JOIN venues v ON v.id = '00000000-0000-4000-8000-000000000301'::uuid
WHERE e.id = '00000000-0000-4000-8000-000000000120'::uuid
ON CONFLICT (id) DO NOTHING;

UPDATE events
SET equipment_confirmed_at = COALESCE(equipment_confirmed_at, now() - interval '2 days')
WHERE id = '00000000-0000-4000-8000-000000000120'::uuid;

INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, feedback, decided_at)
VALUES ('00000000-0000-4000-8000-000000000120'::uuid, 'approved', now() - interval '3 days',
    'coordinator1@connectsphere.test', 'Safety Officer 1', NULL, now() - interval '2 days')
ON CONFLICT (event_id) DO NOTHING;
