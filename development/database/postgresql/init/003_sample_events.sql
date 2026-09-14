-- Fictional demo record; seeds do not send emails.
INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name,
    purpose, description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs, equipment_needs, submission_key)
VALUES ('00000000-0000-4000-8000-000000000036', 'current-user', 'Demo Organiser',
    'organiser@example.test', 'Community Welcome Evening', 'Community building',
    'An evening of introductions, short talks and small-group activities.',
    '2026-12-12 18:00:00+08', '2026-12-12 21:00:00+08', 80, 'Banquet',
    ARRAY['Catering', 'AV System'], ARRAY['Wheelchair ramps', 'Accessible restrooms'],
    'Two wireless microphones and a portable speaker.', '00000000-0000-4000-8000-000000000036')
ON CONFLICT DO NOTHING;
