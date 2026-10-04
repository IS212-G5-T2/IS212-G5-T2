-- Local development data only (SPM-61). Idempotent: every UPDATE only touches
-- seeded rows still in their original state, so re-running it is harmless.

-- 002 stored coordinator ids as the literals 'coordinator1'/'coordinator2',
-- which never match a real users.id, so no coordinator could see these events.
-- Point them at the seeded coordinator accounts.
UPDATE events
SET coordinator_id = users.id::text, coordinator_name = users.display_name
FROM users
WHERE users.email = 'coordinator1@connectsphere.test'
  AND events.id IN ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000104')
  AND (events.coordinator_id IS NULL OR events.coordinator_id = 'coordinator1');

UPDATE events
SET coordinator_id = users.id::text, coordinator_name = users.display_name
FROM users
WHERE users.email = 'coordinator2@connectsphere.test'
  AND events.id = '00000000-0000-4000-8000-000000000103'
  AND events.coordinator_id = 'coordinator2';

-- The attendee page only shows registration once both window bounds exist.
-- Give the two published, registration-enabled seed events an open window.
UPDATE events
SET registration_opens_at = '2026-09-01T00:00:00Z', registration_closes_at = '2027-02-04T16:00:00Z'
WHERE id = '00000000-0000-4000-8000-000000000102'
  AND registration_opens_at IS NULL AND registration_closes_at IS NULL;

UPDATE events
SET registration_opens_at = '2026-09-01T00:00:00Z', registration_closes_at = '2027-03-12T15:59:00Z'
WHERE id = '00000000-0000-4000-8000-000000000104'
  AND registration_opens_at IS NULL AND registration_closes_at IS NULL;
