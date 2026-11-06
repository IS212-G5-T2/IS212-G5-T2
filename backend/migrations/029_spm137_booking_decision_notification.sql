-- SPM-137: a venue booking decision notification (venue_booking_approved / venue_booking_rejected) links to the
-- booking that was decided, so the notification bell can open that one booking on the Bookings page.
-- Nullable and backward compatible: every existing notification keeps a NULL link. Deleting a booking removes its
-- notification, as deleting an event already removes its notifications (related_event_id).
-- Idempotent: safe to apply more than once.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS related_booking_id uuid REFERENCES venue_bookings (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_related_booking_idx
  ON notifications (related_booking_id) WHERE related_booking_id IS NOT NULL;
