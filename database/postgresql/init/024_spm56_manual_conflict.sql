-- SPM-56 local manual-review fixture.
-- Gives Venue Staff one pending request with three overlapping blockers:
-- an approved booking, an active tentative hold, and an unavailable period.
-- Safe to rerun; fixed IDs and ON CONFLICT preserve local edits.
BEGIN;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status,
    hold_expires_at, special_request
)
SELECT
    '00000000-0000-4000-8000-000000005601'::uuid,
    venue.id,
    '00000000-0000-4000-8000-000000000202'::uuid,
    ((CURRENT_DATE + 21)::timestamp + TIME '10:00') AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 21)::timestamp + TIME '11:00') AT TIME ZONE 'Asia/Singapore',
    'pending', now() + INTERVAL '1 day',
    'SPM-56 demo request: approve to review the conflict details.'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO NOTHING;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status
)
SELECT
    '00000000-0000-4000-8000-000000005602'::uuid,
    venue.id,
    '00000000-0000-4000-8000-000000000201'::uuid,
    ((CURRENT_DATE + 21)::timestamp + TIME '08:45') AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 21)::timestamp + TIME '09:15') AT TIME ZONE 'Asia/Singapore',
    'approved'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO NOTHING;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status, hold_expires_at
)
SELECT
    '00000000-0000-4000-8000-000000005603'::uuid,
    venue.id,
    '00000000-0000-4000-8000-000000000203'::uuid,
    ((CURRENT_DATE + 21)::timestamp + TIME '11:30') AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 21)::timestamp + TIME '12:00') AT TIME ZONE 'Asia/Singapore',
    'pending', now() + INTERVAL '1 day'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO NOTHING;

INSERT INTO venue_bookings (
    id, venue_id, event_id, start_at, end_at, status, reason
)
SELECT
    '00000000-0000-4000-8000-000000005604'::uuid,
    venue.id,
    NULL,
    ((CURRENT_DATE + 21)::timestamp + TIME '11:00') AT TIME ZONE 'Asia/Singapore',
    ((CURRENT_DATE + 21)::timestamp + TIME '11:30') AT TIME ZONE 'Asia/Singapore',
    'blocked', 'SPM-56 demo unavailable period'
FROM venues venue
WHERE venue.id = '00000000-0000-4000-8000-000000000301'::uuid
  AND venue.name = 'Sample Birch Lecture Hall'
ON CONFLICT (id) DO NOTHING;

COMMIT;
