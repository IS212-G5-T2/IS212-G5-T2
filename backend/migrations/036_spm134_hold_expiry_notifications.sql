-- SPM-134: persist that a tentative hold's 48-hour expiry reminder was sent, so each hold is reminded exactly once.
-- The marker is set by a conditional UPDATE in the same transaction that writes the Coordinator's notification
-- (VenuesRepository.processTentativeHoldReminders). Idempotent; no backfill: an active hold already within 48 hours of
-- expiry is reminded on the first run after this change, and one that is past its expiry never is.
ALTER TABLE venue_bookings
  ADD COLUMN IF NOT EXISTS hold_reminder_sent_at timestamptz;
