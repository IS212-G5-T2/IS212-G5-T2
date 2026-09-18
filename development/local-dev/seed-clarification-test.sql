-- Seed test data for SPM-39 clarification testing

-- Update existing demo event with a coordinator assignment
UPDATE events
SET coordinator_id = 'coordinator-test-1',
    coordinator_name = 'Test Coordinator'
WHERE id = '00000000-0000-4000-8000-000000000036';

-- Add a second test event with Under_Review status for reply testing
INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name,
    purpose, description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs, equipment_needs,
    submission_key, coordinator_id, coordinator_name, status)
VALUES ('00000000-0000-4000-8000-000000000037', 'organiser-test-1', 'Test Organiser',
    'organiser2@example.test', 'Team Building Workshop', 'Team engagement',
    'A half-day workshop for team building and skill sharing.',
    '2026-12-20 14:00:00+08', '2026-12-20 17:00:00+08', 40, 'Classroom',
    ARRAY['Projector'], ARRAY['Wheelchair accessible'],
    'Laptop for presentations.', '00000000-0000-4000-8000-000000000037',
    'coordinator-test-1', 'Test Coordinator', 'Under_Review')
ON CONFLICT DO NOTHING;

-- Add a test clarification comment on the second event
INSERT INTO event_comments (id, event_id, parent_id, type, author_id, author_name, author_role, message, awaiting_reply, created_at)
VALUES
  ('comment-test-1', '00000000-0000-4000-8000-000000000037', NULL, 'clarification', 'coordinator-test-1', 'Test Coordinator', 'coordinator',
   'Can you confirm if the team lunch should be provided?', true, NOW())
ON CONFLICT DO NOTHING;
