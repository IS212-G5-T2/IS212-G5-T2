-- SPM-56 local manual-review fixture; requires SPM-159 schema migration 024.
-- The pending ordinary request overlaps an approved booking, an active approved
-- tentative hold, and an unavailable period. Reruns refresh these fixed fixtures.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'venue_bookings'
     AND column_name = 'request_kind'
) AS spm159_hold_schema \gset
\if :spm159_hold_schema
BEGIN;

-- Clone seeded events so every event-linked booking has matching event times.
INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT
    '00000000-0000-4000-8000-000000005610'::uuid,
    source.organiser_id, source.organiser_name, source.organiser_email,
    'SPM-56 confirmed booking blocker', 'SPM-56 local test fixture',
    'Approved booking used to verify approval-time conflict detection.',
    ((CURRENT_DATE + 21)::timestamp + TIME '08:45') AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 21)::timestamp + TIME '09:15') AT TIME ZONE 'Asia/Singapore',
    source.expected_attendance, source.preferred_room_layout,
    source.required_facilities, source.accessibility_needs,
    source.equipment_needs, false, 'Approved', source.coordinator_id,
    source.coordinator_name, '00000000-0000-4000-8000-000000005610'::uuid
FROM events source
WHERE source.id = '00000000-0000-4000-8000-000000000201'::uuid
ON CONFLICT (id) DO UPDATE SET
    event_name = EXCLUDED.event_name, purpose = EXCLUDED.purpose,
    description = EXCLUDED.description,
    start_date_time = EXCLUDED.start_date_time,
    end_date_time = EXCLUDED.end_date_time,
    status = EXCLUDED.status;

INSERT INTO events (
    id, organiser_id, organiser_name, organiser_email, event_name, purpose,
    description, start_date_time, end_date_time, expected_attendance,
    preferred_room_layout, required_facilities, accessibility_needs,
    equipment_needs, registration_enabled, status, coordinator_id,
    coordinator_name, submission_key
)
SELECT
    '00000000-0000-4000-8000-000000005611'::uuid,
    source.organiser_id, source.organiser_name, source.organiser_email,
    'SPM-56 active tentative hold blocker', 'SPM-56 local test fixture',
    'Approved tentative hold used to verify active-hold conflict detection.',
    ((CURRENT_DATE + 21)::timestamp + TIME '10:30') AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 21)::timestamp + TIME '12:00') AT TIME ZONE 'Asia/Singapore',
    source.expected_attendance, source.preferred_room_layout,
    source.required_facilities, source.accessibility_needs,
    source.equipment_needs, false, 'Approved', source.coordinator_id,
    source.coordinator_name, '00000000-0000-4000-8000-000000005611'::uuid
FROM events source
WHERE source.id = '00000000-0000-4000-8000-000000000203'::uuid
ON CONFLICT (id) DO UPDATE SET
    event_name = EXCLUDED.event_name, purpose = EXCLUDED.purpose,
    description = EXCLUDED.description,
    start_date_time = EXCLUDED.start_date_time,
    end_date_time = EXCLUDED.end_date_time,
    status = EXCLUDED.status;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status, request_kind,
    hold_expires_at, special_request
)
SELECT
    '00000000-0000-4000-8000-000000005601'::uuid,
    venue.id,
    '00000000-0000-4000-8000-000000000202'::uuid,
    ((CURRENT_DATE + 21)::timestamp + TIME '10:00') AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 21)::timestamp + TIME '13:00') AT TIME ZONE 'Asia/Singapore',
    'pending', 'booking', NULL,
    'SPM-56 demo request: approve to review the conflict details.'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO UPDATE SET
  venue_id = EXCLUDED.venue_id, event_id = EXCLUDED.event_id,
  start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at,
  status = EXCLUDED.status, request_kind = EXCLUDED.request_kind,
  hold_expires_at = EXCLUDED.hold_expires_at,
  special_request = EXCLUDED.special_request;

INSERT INTO venue_booking_requests (event_id, venue_id, special_request)
SELECT '00000000-0000-4000-8000-000000000202'::uuid, venue.id,
       'SPM-56 demo request: approve to review the conflict details.'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (event_id, venue_id) DO UPDATE
  SET special_request = EXCLUDED.special_request;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status, request_kind
)
SELECT
    '00000000-0000-4000-8000-000000005602'::uuid,
    venue.id,
    '00000000-0000-4000-8000-000000005610'::uuid,
    ((CURRENT_DATE + 21)::timestamp + TIME '08:45') AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 21)::timestamp + TIME '09:15') AT TIME ZONE 'Asia/Singapore',
    'approved', 'booking'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO UPDATE SET
  venue_id = EXCLUDED.venue_id, event_id = EXCLUDED.event_id,
  start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at,
  status = EXCLUDED.status, request_kind = EXCLUDED.request_kind;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at
)
SELECT
    '00000000-0000-4000-8000-000000005603'::uuid,
    venue.id,
    '00000000-0000-4000-8000-000000005611'::uuid,
    ((CURRENT_DATE + 21)::timestamp + TIME '10:30') AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 21)::timestamp + TIME '12:00') AT TIME ZONE 'Asia/Singapore',
    'approved', 'tentative_hold', now() + INTERVAL '1 day'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO UPDATE SET
  venue_id = EXCLUDED.venue_id, event_id = EXCLUDED.event_id,
  start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at,
  status = EXCLUDED.status, request_kind = EXCLUDED.request_kind,
  hold_expires_at = EXCLUDED.hold_expires_at;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status, reason
)
SELECT
    '00000000-0000-4000-8000-000000005604'::uuid,
    venue.id,
    NULL,
    ((CURRENT_DATE + 21)::timestamp + TIME '10:45') AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 21)::timestamp + TIME '11:15') AT TIME ZONE 'Asia/Singapore',
    'blocked', 'SPM-56 demo unavailable period'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO UPDATE SET
  venue_id = EXCLUDED.venue_id, start_at = EXCLUDED.start_at,
  end_at = EXCLUDED.end_at, status = EXCLUDED.status,
  reason = EXCLUDED.reason;

COMMIT;
\else
\echo 'SPM-56 fixture skipped: apply SPM-159 init migration 024 first.'
\endif
