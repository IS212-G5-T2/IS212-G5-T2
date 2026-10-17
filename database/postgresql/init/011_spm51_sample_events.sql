-- SPM-51 local sample events for exercising venue availability permutations.
-- Idempotent: reruns preserve local sample edits and only normalize legacy generated titles.
-- All five events are assigned to the seeded Coordinator 1 account so they are
-- available in the coordinator's venue booking-request event selector.
INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT sample.id, organiser.id::text, organiser.display_name, organiser.email,
    sample.event_name, sample.purpose, sample.description,
    ((CURRENT_DATE + sample.start_day)::timestamp + sample.start_time)
        AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + sample.end_day)::timestamp + sample.end_time)
        AT TIME ZONE 'Asia/Singapore',
    sample.expected_attendance, sample.room_layout, sample.facilities,
    sample.accessibility, sample.equipment, sample.registration_enabled,
    sample.status, coordinator.id::text, coordinator.display_name, sample.id
FROM (VALUES
    (
        '00000000-0000-4000-8000-000000000201'::uuid,
        'Small classroom workshop', 'Hands-on learning',
        'Short weekday workshop with a small group.', 14, '09:00'::time,
        14, '10:30'::time, 24, 'Classroom', ARRAY['Projector']::text[],
        ARRAY[]::text[], 'Projector and whiteboard markers.', false, 'Approved',
        'organiser1@connectsphere.test'
    ),
    (
        '00000000-0000-4000-8000-000000000202'::uuid,
        'Accessible hybrid seminar', 'Share research',
        'Medium-length seminar with hybrid presentation equipment.', 21,
        '10:00'::time, 21, '13:00'::time, 80, 'Theatre',
        ARRAY['AV System', 'Wi-Fi']::text[],
        ARRAY['Wheelchair ramps', 'Accessible restrooms']::text[],
        'Two microphones, camera, and presentation screen.', true, 'Approved',
        'organiser2@connectsphere.test'
    ),
    (
        '00000000-0000-4000-8000-000000000203'::uuid,
        'Student innovation expo', 'Showcase prototypes',
        'Large daytime expo with extended setup and attendee flow.', 28,
        '08:00'::time, 28, '17:00'::time, 320, 'Exhibition',
        ARRAY['Power outlets', 'Wi-Fi', 'AV System']::text[],
        ARRAY['Step-free access', 'Accessible restrooms']::text[],
        'Display tables, extension cables, and two screens.', true, 'Approved',
        'organiser3@connectsphere.test'
    ),
    (
        '00000000-0000-4000-8000-000000000204'::uuid,
        'Evening alumni networking', 'Connect alumni and students',
        'Evening networking reception with catering and flexible seating.', 35,
        '18:30'::time, 35, '22:00'::time, 145, 'Cocktail',
        ARRAY['Catering', 'AV System']::text[],
        ARRAY['Quiet room', 'Accessible restrooms']::text[],
        'Wireless microphone and portable speaker.', true, 'Approved',
        'organiser1@connectsphere.test'
    ),
    (
        '00000000-0000-4000-8000-000000000205'::uuid,
        'Overnight production rehearsal', 'Prepare a live production',
        'Late-night rehearsal crossing midnight with a compact crew.', 42,
        '22:00'::time, 43, '02:00'::time, 36, 'Boardroom',
        ARRAY['AV System', 'Power outlets']::text[],
        ARRAY['Step-free access']::text[],
        'Audio mixer, lighting controller, and rehearsal microphones.', false,
        'Approved', 'organiser2@connectsphere.test'
    )
) AS sample(
    id, event_name, purpose, description, start_day, start_time, end_day,
    end_time, expected_attendance, room_layout, facilities, accessibility,
    equipment, registration_enabled, status, organiser_email
)
JOIN users organiser ON organiser.email = sample.organiser_email
JOIN users coordinator ON coordinator.email = 'coordinator1@connectsphere.test'
ON CONFLICT (id) DO UPDATE
SET event_name = EXCLUDED.event_name
WHERE events.event_name LIKE 'SPM-51 Seed:%';
