-- SPM-51 local sample data must follow the SPM-148 status lifecycle.
-- These named seeded events were accidentally marked Confirmed before either
-- an equipment request or venue booking had moved them to Planning.
UPDATE events AS event
SET status = 'Approved', updated_at = now()
WHERE event.id IN (
  '00000000-0000-4000-8000-000000000201'::uuid,
  '00000000-0000-4000-8000-000000000203'::uuid,
  '00000000-0000-4000-8000-000000000204'::uuid
)
  AND event.status = 'Confirmed'
  AND NOT EXISTS (SELECT 1 FROM equipment_requests request WHERE request.event_id = event.id)
  AND NOT EXISTS (SELECT 1 FROM venue_bookings booking WHERE booking.event_id = event.id);
