-- SPM-131: keep safety review markers separate from operational venue/equipment status.
-- Each feedback item identifies the arrangements the coordinator must review before resubmission.
ALTER TABLE safety_check_feedback_items
  ADD COLUMN IF NOT EXISTS review_arrangements jsonb NOT NULL
    DEFAULT '{"venueIds": [], "equipmentIds": []}'::jsonb;

DO $$ BEGIN
  ALTER TABLE safety_check_feedback_items
    ADD CONSTRAINT safety_feedback_review_arrangements_shape
    CHECK (
      jsonb_typeof(review_arrangements) = 'object'
      AND jsonb_typeof(review_arrangements->'venueIds') = 'array'
      AND jsonb_typeof(review_arrangements->'equipmentIds') = 'array'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
