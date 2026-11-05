-- SPM-135 readiness check for seeded data (SPM-149).
--
-- Fails with an error listing every Confirmed event that does not meet the readiness rule in
-- backend/src/events/status/readiness.ts. Run it against a seeded database:
--
--   psql -U spm -d spm -v ON_ERROR_STOP=1 -f database/postgresql/checks/confirmed_readiness.sql
--
-- It is not part of init/, so the image never runs it. CI runs it after init completes.
-- The rule, as this check reads it (mirrors readiness.ts and venue-unavailable.ts):
--   venue:     an approved booking with no hold, not venue-unavailable; no pending request, active hold,
--              or expired booking; every rejected booking covered by an approved, non-hold booking of the
--              same event at the same venue that is not venue-unavailable.
--              Venue-unavailable: a blocked period with no event, overlapping the booking widened by the
--              venue's setup time before and turnaround time after (exclusive at both ends).
--   equipment: no active line other than Reserved, and either a Reserved line or equipment_confirmed_at.
--   safety:    an approved event_safety_checks row.

DO $$
DECLARE
    failures text;
BEGIN
    WITH confirmed AS (
        SELECT e.id, e.event_name, e.equipment_confirmed_at
        FROM events e
        WHERE e.status = 'Confirmed'
    ),
    -- Venue-unavailable, as in backend/src/events/venue-unavailable.ts (VENUE_UNAVAILABLE_SQL).
    unavailable AS (
        SELECT b.id AS booking_id
        FROM venue_bookings b
        JOIN venues v ON v.id = b.venue_id
        WHERE EXISTS (
            SELECT 1 FROM venue_bookings u
            WHERE u.venue_id = b.venue_id AND u.event_id IS NULL AND u.status = 'blocked'
              AND u.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)
              AND u.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)
        )
    ),
    problems AS (
        -- Venue: no approved, non-hold, available booking.
        SELECT c.id, c.event_name, 'venue approval missing' AS kind
        FROM confirmed c
        WHERE NOT EXISTS (
            SELECT 1 FROM venue_bookings b
            WHERE b.event_id = c.id
              AND b.status = 'approved'
              AND b.hold_expires_at IS NULL
              AND b.request_kind <> 'tentative_hold'
              AND b.id NOT IN (SELECT booking_id FROM unavailable)
        )
        UNION ALL
        -- Venue: a pending request, an active or expired hold, or an expired booking is outstanding.
        SELECT c.id, c.event_name, 'venue request pending, on hold or expired'
        FROM confirmed c
        JOIN venue_bookings b ON b.event_id = c.id
        WHERE b.status IN ('pending', 'expired')
           OR (b.status = 'approved' AND (b.hold_expires_at IS NOT NULL OR b.request_kind = 'tentative_hold'))
        UNION ALL
        -- Venue: an approved booking that is venue-unavailable is outstanding.
        SELECT c.id, c.event_name, 'approved venue is unavailable'
        FROM confirmed c
        JOIN venue_bookings b ON b.event_id = c.id AND b.status = 'approved'
        WHERE b.id IN (SELECT booking_id FROM unavailable)
        UNION ALL
        -- Venue: a rejected booking needs an approved, non-hold, available replacement for the same event.
        SELECT c.id, c.event_name, 'rejected venue without replacement'
        FROM confirmed c
        JOIN venue_bookings b ON b.event_id = c.id AND b.status = 'rejected'
        WHERE NOT EXISTS (
            SELECT 1 FROM venue_bookings r
            WHERE r.event_id = b.event_id
              AND r.venue_id = b.venue_id
              AND r.status = 'approved'
              AND r.hold_expires_at IS NULL
              AND r.request_kind <> 'tentative_hold'
              AND r.start_at <= b.start_at AND r.end_at >= b.end_at
              AND r.id NOT IN (SELECT booking_id FROM unavailable)
        )
        UNION ALL
        -- Equipment: any active line that is not Reserved is outstanding.
        SELECT c.id, c.event_name, 'equipment not reserved'
        FROM confirmed c
        JOIN equipment_reservations r ON r.event_id = c.id
        WHERE r.status NOT IN ('Cancelled', 'Released', 'Reserved')
        UNION ALL
        -- Equipment: with no active lines, an explicit "none needed" confirmation is required.
        SELECT c.id, c.event_name, 'equipment neither reserved nor confirmed as not needed'
        FROM confirmed c
        WHERE c.equipment_confirmed_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM equipment_reservations r
              WHERE r.event_id = c.id AND r.status NOT IN ('Cancelled', 'Released')
          )
        UNION ALL
        -- Safety: an approved safety check is required.
        SELECT c.id, c.event_name, 'safety approval missing'
        FROM confirmed c
        WHERE NOT EXISTS (
            SELECT 1 FROM event_safety_checks s
            WHERE s.event_id = c.id AND s.status = 'approved'
        )
    )
    SELECT string_agg(format('%s: %s', event_name, kind), '; ' ORDER BY event_name, kind)
    INTO failures
    FROM (SELECT DISTINCT id, event_name, kind FROM problems) p;

    IF failures IS NOT NULL THEN
        RAISE EXCEPTION 'SPM-135 readiness failed for Confirmed events: %', failures;
    END IF;

    RAISE NOTICE 'Readiness check passed for % Confirmed events.',
        (SELECT count(*) FROM events WHERE status = 'Confirmed');
END $$;
