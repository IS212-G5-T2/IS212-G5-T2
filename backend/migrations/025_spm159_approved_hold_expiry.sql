-- SPM-159: an approved tentative hold must carry its approval-time expiry.
-- Do not infer historical expiries: fail with a clear error if legacy rows violate this rule.
DO $$
DECLARE
  invalid_count bigint;
BEGIN
  SELECT count(*) INTO invalid_count
    FROM venue_bookings
   WHERE request_kind = 'tentative_hold'
     AND status = 'approved'
     AND hold_expires_at IS NULL;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce approved tentative hold expiry: % approved tentative hold row(s) have NULL hold_expires_at. Review these rows explicitly before retrying migration 025.',
      invalid_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'venue_bookings'::regclass
       AND conname = 'venue_bookings_approved_tentative_hold_expiry_check'
  ) THEN
    ALTER TABLE venue_bookings
      ADD CONSTRAINT venue_bookings_approved_tentative_hold_expiry_check
      CHECK (request_kind <> 'tentative_hold'
             OR status <> 'approved'
             OR hold_expires_at IS NOT NULL)
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE venue_bookings
  VALIDATE CONSTRAINT venue_bookings_approved_tentative_hold_expiry_check;
