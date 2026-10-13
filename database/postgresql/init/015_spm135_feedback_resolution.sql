-- SPM-135: safety check feedback items with coordinator resolution.
-- When the Safety Officer requests changes, each feedback item is listed. The coordinator
-- resolves each item (sets resolved_by_coordinator_at); re-requesting needs all items resolved.
-- Idempotent.

CREATE TABLE IF NOT EXISTS safety_check_feedback_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    feedback_text text NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    resolved_by_coordinator_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_safety_feedback_event ON safety_check_feedback_items (event_id);

-- A safety check that is reset (re-requested, invalidated) drops its feedback items too.
CREATE OR REPLACE FUNCTION invalidate_safety_check(p_event_id uuid) RETURNS void
LANGUAGE sql AS $$
  DELETE FROM event_safety_checks WHERE event_id = p_event_id;
  DELETE FROM safety_check_feedback_items WHERE event_id = p_event_id;
$$;
