-- SPM-113 identifies reservation demand by equipment name.  A name must
-- therefore identify exactly one inventory record.  Existing duplicate data is
-- deliberately surfaced rather than silently merged or discarded.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM equipment GROUP BY equipment_name HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique equipment names: duplicate equipment records exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS equipment_name_unique_idx ON equipment (equipment_name);
