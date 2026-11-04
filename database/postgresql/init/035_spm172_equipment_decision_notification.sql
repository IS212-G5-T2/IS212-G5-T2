-- SPM-172: an equipment request decision notification (equipment_request_reserved / equipment_request_cannot_provide)
-- links to the request that was decided, so the notification bell can open that one request on the equipment requests
-- page (/equipment/requests?request=<id>).
-- Nullable and backward compatible: every existing notification keeps a NULL link. Deleting a request removes its
-- notification, as deleting an event already removes its notifications (related_event_id).
-- Idempotent: safe to apply more than once.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS related_equipment_request_id uuid REFERENCES equipment_requests (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_related_equipment_request_idx
  ON notifications (related_equipment_request_id) WHERE related_equipment_request_id IS NOT NULL;
