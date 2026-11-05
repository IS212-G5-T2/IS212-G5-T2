-- SPM-149 local sample events for the Event Coordinator accounts, with statuses that match
-- their venue bookings, equipment and safety state (SPM-135 readiness rule).
-- Idempotent: ON CONFLICT DO NOTHING keeps local edits. Dates are relative to the current date
-- and start 50 days out, so the SPM-51/52 availability windows (days 7 to 42) stay free.
--
-- Order matters: venue bookings and equipment reservations fire triggers that clear the
-- event's safety check, so the safety rows are inserted last.
--
-- Accounts: coordinator1, coordinator2, coordinator3 and coordinator_venuestaff own events.
-- The Coordinator Lead owns none. Submitted events 401 and 402 are left unassigned for the Lead queue.

-- Events. Only Submitted, Approved, Planning, Confirmed and Rejected are seeded
-- (Completed and Cancelled are not implemented).
INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, rejection_reason,
    coordinator_id, coordinator_name, submission_key, equipment_confirmed_at
)
SELECT sample.id, organiser.id::text, organiser.display_name, organiser.email,
    sample.event_name, sample.purpose, sample.description,
    ((CURRENT_DATE + sample.start_day)::timestamp + sample.start_time)
        AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + sample.end_day)::timestamp + sample.end_time)
        AT TIME ZONE 'Asia/Singapore',
    sample.expected_attendance, sample.room_layout, sample.facilities,
    sample.accessibility, sample.equipment, sample.registration_enabled,
    sample.status, sample.rejection_reason,
    coordinator.id::text, coordinator.display_name, sample.id,
    CASE WHEN sample.no_equipment_needed THEN now() - interval '2 days' END
FROM (VALUES
    ('00000000-0000-4000-8000-000000000401'::uuid, 'SPM-149 Seed: Submitted - unassigned for the Lead queue',
        'Campus open day briefing', 'Briefing for prospective students.', 50, '09:00'::time, 50, '11:00'::time,
        60, 'Classroom', ARRAY['Projector']::text[], ARRAY[]::text[], 'Projector and handouts.', false,
        'Submitted', NULL, NULL, false, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000402'::uuid, 'SPM-149 Seed: Submitted - unassigned for the Lead queue',
        'Peer mentoring kickoff', 'Kick off the mentoring programme for first-year students.', 55, '13:00'::time, 55, '15:00'::time,
        90, 'Theatre', ARRAY['AV System']::text[], ARRAY['Step-free access']::text[], 'Two microphones.', true,
        'Submitted', NULL, NULL, false, 'organiser2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000403'::uuid, 'SPM-149 Seed: Submitted - assigned, awaiting review',
        'Research poster session', 'Showcase final-year research posters.', 52, '10:00'::time, 52, '12:00'::time,
        120, 'Exhibition', ARRAY['Power outlets']::text[], ARRAY['Accessible restrooms']::text[], 'Poster boards.', true,
        'Submitted', NULL, 'coordinator1@connectsphere.test', false, 'organiser3@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000404'::uuid, 'SPM-149 Seed: Submitted - assigned, awaiting review',
        'Careers fair preview', 'Preview session for the upcoming careers fair.', 58, '09:30'::time, 58, '11:30'::time,
        150, 'Theatre', ARRAY['AV System', 'Wi-Fi']::text[], ARRAY['Wheelchair access']::text[], 'Presentation screen.', true,
        'Submitted', NULL, 'coordinator_venuestaff@connectsphere.test', false, 'organiser2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000405'::uuid, 'SPM-149 Seed: Approved - no venue or equipment requested yet',
        'Writing workshop', 'Creative writing workshop for students.', 60, '14:00'::time, 60, '16:00'::time,
        30, 'Classroom', ARRAY['Whiteboard']::text[], ARRAY[]::text[], 'Whiteboard markers.', false,
        'Approved', NULL, 'coordinator1@connectsphere.test', false, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000406'::uuid, 'SPM-149 Seed: Approved - no venue or equipment requested yet',
        'Hackathon briefing', 'Briefing before a student hackathon.', 62, '18:00'::time, 62, '19:30'::time,
        70, 'Theatre', ARRAY['Wi-Fi']::text[], ARRAY[]::text[], 'Laptops are supplied by participants.', true,
        'Approved', NULL, 'coordinator2@connectsphere.test', false, 'organiser3@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000407'::uuid, 'SPM-149 Seed: Planning - venue approved, equipment and safety outstanding',
        'Leadership panel', 'Panel discussion with alumni leaders.', 64, '09:00'::time, 64, '12:00'::time,
        160, 'Theatre', ARRAY['AV System']::text[], ARRAY['Wheelchair access']::text[], 'Panel microphones.', true,
        'Planning', NULL, 'coordinator1@connectsphere.test', false, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000408'::uuid, 'SPM-149 Seed: Planning - venue request pending, safety awaiting check',
        'Industry networking lunch', 'Lunch networking with industry partners.', 66, '12:00'::time, 66, '14:00'::time,
        200, 'Banquet', ARRAY['Catering']::text[], ARRAY['Accessible restrooms']::text[], 'Lectern and microphone.', false,
        'Planning', NULL, 'coordinator2@connectsphere.test', false, 'organiser2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000409'::uuid, 'SPM-149 Seed: Confirmed - venue, equipment and safety all ready',
        'Engineering design showcase', 'Showcase of capstone design projects.', 68, '10:00'::time, 68, '16:00'::time,
        250, 'Exhibition', ARRAY['Power outlets', 'Wi-Fi']::text[], ARRAY['Step-free access']::text[],
        'Two wireless microphones.', true, 'Confirmed', NULL, 'coordinator1@connectsphere.test', false, 'organiser3@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000410'::uuid, 'SPM-149 Seed: Confirmed - venue and safety ready, no equipment needed',
        'Graduate reflection talk', 'Short talks by recent graduates.', 70, '09:00'::time, 70, '12:00'::time,
        100, 'Seminar Room', ARRAY['Projector']::text[], ARRAY['Quiet room']::text[], 'None needed.', false,
        'Confirmed', NULL, 'coordinator3@connectsphere.test', true, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000411'::uuid, 'SPM-149 Seed: Confirmed - venue, equipment and safety all ready',
        'Robotics open house', 'Demonstrations of student robotics projects.', 72, '13:00'::time, 72, '17:00'::time,
        110, 'Exhibition', ARRAY['AV System']::text[], ARRAY['Accessible restrooms']::text[], 'One projector.', true,
        'Confirmed', NULL, 'coordinator_venuestaff@connectsphere.test', false, 'organiser2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000412'::uuid, 'SPM-149 Seed: Rejected - venue request declined',
        'Dining hall pop-up', 'Pop-up event with student food stalls.', 74, '12:00'::time, 74, '14:00'::time,
        180, 'Banquet', ARRAY['Catering']::text[], ARRAY[]::text[], 'Serving tables.', false,
        'Rejected', 'The requested venue is unavailable for the required event duration.',
        'coordinator2@connectsphere.test', false, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000413'::uuid, 'SPM-149 Seed: Rejected - safety arrangements not approved',
        'Rooftop music night', 'Evening music performances on the rooftop.', 76, '18:00'::time, 76, '21:00'::time,
        95, 'Cocktail', ARRAY['AV System']::text[], ARRAY[]::text[], 'Speakers and stage lighting.', true,
        'Rejected', 'The Safety Officer did not approve the planned arrangements.',
        'coordinator3@connectsphere.test', false, 'organiser3@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000414'::uuid, 'SPM-149 Seed: Approved - no venue or equipment requested yet',
        'Study skills clinic', 'Drop-in study skills sessions.', 78, '10:00'::time, 78, '12:00'::time,
        40, 'Classroom', ARRAY[]::text[], ARRAY['Quiet room']::text[], 'None needed.', false,
        'Approved', NULL, 'coordinator3@connectsphere.test', false, 'organiser2@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000415'::uuid, 'SPM-149 Seed: Submitted - assigned, awaiting review',
        'Alumni homecoming dinner', 'Dinner for returning alumni.', 80, '19:00'::time, 80, '22:00'::time,
        140, 'Banquet', ARRAY['Catering', 'AV System']::text[], ARRAY['Step-free access']::text[], 'Microphone for speeches.', true,
        'Submitted', NULL, 'coordinator3@connectsphere.test', false, 'organiser1@connectsphere.test'),
    ('00000000-0000-4000-8000-000000000416'::uuid, 'SPM-149 Seed: Planning - equipment requested, reservation pending',
        'Coding bootcamp', 'Hands-on coding bootcamp for students.', 82, '09:00'::time, 82, '11:00'::time,
        45, 'Classroom', ARRAY['Wi-Fi']::text[], ARRAY[]::text[], 'Portable speaker for demos.', false,
        'Planning', NULL, 'coordinator3@connectsphere.test', false, 'organiser2@connectsphere.test')
) AS sample(
    id, event_name, purpose, description, start_day, start_time, end_day, end_time,
    expected_attendance, room_layout, facilities, accessibility, equipment,
    registration_enabled, status, rejection_reason, coordinator_email, no_equipment_needed, organiser_email
)
JOIN users organiser ON organiser.email = sample.organiser_email
LEFT JOIN users coordinator ON coordinator.email = sample.coordinator_email
ON CONFLICT (id) DO NOTHING;

-- Venue bookings. Approved bookings back Planning and Confirmed events; a pending one is a
-- venue request still awaiting a decision; a rejected one explains a Rejected event.
-- Venues are the seeded sample venues 301 to 317 (Cedar Studio 125 is kept clear of these windows).
INSERT INTO venue_bookings (id, venue_id, event_id, start_at, end_at, status, reason, hold_expires_at)
SELECT b.id, b.venue_id, e.id,
    ((CURRENT_DATE + b.start_day)::timestamp + b.start_time) AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + b.start_day)::timestamp + b.end_time) AT TIME ZONE 'Asia/Singapore',
    b.status, NULL, NULL
FROM (VALUES
    ('00000000-0000-4000-8000-000000000501'::uuid, '00000000-0000-4000-8000-000000000301'::uuid,
        '00000000-0000-4000-8000-000000000407'::uuid, 64, '09:00'::time, '12:00'::time, 'approved'),
    ('00000000-0000-4000-8000-000000000502'::uuid, '00000000-0000-4000-8000-000000000303'::uuid,
        '00000000-0000-4000-8000-000000000408'::uuid, 66, '12:00'::time, '14:00'::time, 'pending'),
    ('00000000-0000-4000-8000-000000000503'::uuid, '00000000-0000-4000-8000-000000000313'::uuid,
        '00000000-0000-4000-8000-000000000409'::uuid, 68, '10:00'::time, '16:00'::time, 'approved'),
    ('00000000-0000-4000-8000-000000000504'::uuid, '00000000-0000-4000-8000-000000000316'::uuid,
        '00000000-0000-4000-8000-000000000410'::uuid, 70, '09:00'::time, '12:00'::time, 'approved'),
    ('00000000-0000-4000-8000-000000000505'::uuid, '00000000-0000-4000-8000-000000000317'::uuid,
        '00000000-0000-4000-8000-000000000411'::uuid, 72, '13:00'::time, '17:00'::time, 'approved'),
    ('00000000-0000-4000-8000-000000000506'::uuid, '00000000-0000-4000-8000-000000000310'::uuid,
        '00000000-0000-4000-8000-000000000412'::uuid, 74, '12:00'::time, '14:00'::time, 'rejected'),
    ('00000000-0000-4000-8000-000000000507'::uuid, '00000000-0000-4000-8000-000000000309'::uuid,
        '00000000-0000-4000-8000-000000000416'::uuid, 82, '09:00'::time, '11:00'::time, 'approved')
) AS b(id, venue_id, event_id, start_day, start_time, end_time, status)
JOIN venues v ON v.id = b.venue_id
JOIN events e ON e.id = b.event_id
ON CONFLICT (id) DO NOTHING;

-- Equipment reservations. Reserved lines satisfy the readiness rule; a Requested line does not.
INSERT INTO equipment_reservations (id, event_id, equipment_name, quantity, status)
VALUES
    ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000409', 'Wireless microphone', 2, 'Reserved'),
    ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000411', 'Projector 4K', 1, 'Reserved'),
    ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000416', 'Portable speaker', 1, 'Requested')
ON CONFLICT (id) DO NOTHING;

-- Safety checks go last: the venue and equipment triggers above clear a safety row when they change.
-- Confirmed events 409, 410 and 411 have an approved check. Event 408 is awaiting a check.
-- Event 407 has none, so its safety item stays outstanding.
INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, feedback, decided_at)
VALUES
    ('00000000-0000-4000-8000-000000000409', 'approved', now() - interval '5 days',
        'coordinator1@connectsphere.test', 'Safety Officer 1', NULL, now() - interval '4 days'),
    ('00000000-0000-4000-8000-000000000410', 'approved', now() - interval '5 days',
        'coordinator3@connectsphere.test', 'Safety Officer 2', NULL, now() - interval '4 days'),
    ('00000000-0000-4000-8000-000000000411', 'approved', now() - interval '5 days',
        'coordinator_venuestaff@connectsphere.test', 'Safety Officer 1', NULL, now() - interval '4 days'),
    ('00000000-0000-4000-8000-000000000408', 'pending', now() - interval '1 day',
        'coordinator2@connectsphere.test', NULL, NULL, NULL)
ON CONFLICT (event_id) DO NOTHING;

-- Keep the 002 events that were seeded as Confirmed with no venue or equipment consistent on existing volumes.
-- Fresh volumes already get Approved from 002_seed_data.sql.
UPDATE events
SET status = 'Approved'
WHERE id IN ('00000000-0000-4000-8000-000000000036', '00000000-0000-4000-8000-000000000104')
  AND status = 'Confirmed'
  AND NOT EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = events.id);

-- Organiser 1's one development draft, saved through the drafts table (backend/migrations/001_event_drafts.sql).
-- Skipped when that table is not present in this database.
DO $$
BEGIN
  IF to_regclass('event_drafts') IS NOT NULL THEN
    INSERT INTO event_drafts (id, organiser_id, fields)
    SELECT '00000000-0000-4000-8000-000000000451'::uuid, u.id::text,
        jsonb_build_object(
            'name', 'SPM-149 Seed: Draft - not yet submitted',
            'purpose', 'Draft for organiser testing.',
            'description', 'Saved draft that has not been submitted to a coordinator.',
            'expectedAttendance', '25'
        )
    FROM users u WHERE u.email = 'organiser1@connectsphere.test'
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
