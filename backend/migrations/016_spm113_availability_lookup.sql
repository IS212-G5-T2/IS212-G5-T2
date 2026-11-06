-- SPM-113 availability checks join Reserved request lines to event windows by
-- equipment name.  This index keeps that read bounded as reservation history grows.
CREATE INDEX IF NOT EXISTS equipment_reservations_reserved_name_event_idx
    ON equipment_reservations (equipment_name, event_id)
    WHERE status = 'Reserved';
