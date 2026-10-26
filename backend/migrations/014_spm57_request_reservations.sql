ALTER TABLE equipment_reservations
    ADD COLUMN IF NOT EXISTS equipment_request_item_id uuid;

DO $$ BEGIN
    ALTER TABLE equipment_reservations
        ADD CONSTRAINT equipment_reservations_request_item_fk
        FOREIGN KEY (equipment_request_item_id) REFERENCES equipment_request_items (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS equipment_reservations_request_item_uidx
    ON equipment_reservations (equipment_request_item_id)
    WHERE equipment_request_item_id IS NOT NULL;

WITH request_items AS (
    SELECT r.event_id, i.id AS item_id, i.equipment_name, i.quantity,
           row_number() OVER (
               PARTITION BY r.event_id, i.equipment_name, i.quantity
               ORDER BY r.created_at, r.id, i.item_order, i.id
           ) AS occurrence
      FROM equipment_requests r
      JOIN equipment_request_items i ON i.request_id = r.id
), requested_reservations AS (
    SELECT id AS reservation_id, event_id, equipment_name, quantity,
           row_number() OVER (
               PARTITION BY event_id, equipment_name, quantity
               ORDER BY created_at, id
           ) AS occurrence
      FROM equipment_reservations
     WHERE status = 'Requested' AND equipment_request_item_id IS NULL
)
UPDATE equipment_reservations reservation
   SET equipment_request_item_id = request_item.item_id
  FROM requested_reservations candidate
  JOIN request_items request_item
    ON request_item.event_id = candidate.event_id
   AND request_item.equipment_name = candidate.equipment_name
   AND request_item.quantity = candidate.quantity
   AND request_item.occurrence = candidate.occurrence
 WHERE reservation.id = candidate.reservation_id;
