-- SPM-54: one permanent request per event/venue pair, with times sourced from events.
-- Existing booking rows and IDs are retained; differing legacy notes are combined
-- in creation order so no stored note is silently discarded.
BEGIN;

CREATE TABLE IF NOT EXISTS venue_booking_requests (
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
    special_request text,
    PRIMARY KEY (event_id, venue_id)
);

INSERT INTO venue_booking_requests (event_id, venue_id, special_request)
SELECT event_id,
       venue_id,
       NULLIF(
           string_agg(special_requests, E'\n\n' ORDER BY created_at, id)
               FILTER (WHERE special_requests IS NOT NULL AND btrim(special_requests) <> ''),
           ''
       )
  FROM venue_bookings
 WHERE event_id IS NOT NULL
 GROUP BY event_id, venue_id
ON CONFLICT (event_id, venue_id) DO UPDATE
    SET special_request = EXCLUDED.special_request
    WHERE venue_booking_requests.special_request IS NULL
      AND EXCLUDED.special_request IS NOT NULL;

ALTER TABLE venue_bookings DROP CONSTRAINT IF EXISTS venue_booking_requests_special_requests_check;
ALTER TABLE venue_bookings DROP CONSTRAINT IF EXISTS venue_bookings_special_requests_check;
ALTER TABLE venue_bookings DROP CONSTRAINT IF EXISTS venue_bookings_kind_check;
ALTER TABLE venue_bookings DROP COLUMN IF EXISTS special_requests;
ALTER TABLE venue_bookings ADD CONSTRAINT venue_bookings_kind_check CHECK (
    (status = 'blocked' AND event_id IS NULL
        AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500
        AND hold_expires_at IS NULL)
    OR (status IN ('pending', 'approved', 'rejected', 'cancelled')
        AND event_id IS NOT NULL AND reason IS NULL)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'venue_bookings_request_fk'
          AND conrelid = 'venue_bookings'::regclass
    ) THEN
        ALTER TABLE venue_bookings
            ADD CONSTRAINT venue_bookings_request_fk
            FOREIGN KEY (event_id, venue_id)
            REFERENCES venue_booking_requests (event_id, venue_id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION ensure_venue_booking_request_association()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.event_id IS NOT NULL THEN
        INSERT INTO venue_booking_requests (event_id, venue_id)
        VALUES (NEW.event_id, NEW.venue_id)
        ON CONFLICT (event_id, venue_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venue_bookings_request_association_trigger ON venue_bookings;
CREATE TRIGGER venue_bookings_request_association_trigger
    BEFORE INSERT OR UPDATE ON venue_bookings
    FOR EACH ROW EXECUTE FUNCTION ensure_venue_booking_request_association();

COMMIT;
