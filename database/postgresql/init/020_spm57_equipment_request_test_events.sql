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
