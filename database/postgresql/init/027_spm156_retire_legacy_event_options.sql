-- SPM-156 fresh database equivalent of backend migration 027 (normalises the seed events).
-- SPM-156: retire event facility and accessibility values the venue schema no
-- longer has, so no form or page shows them and saving an event never fails on
-- a value the coordinator or organiser cannot see or choose.
--
-- The venue reference tables (`accessibility_features`, `facilities`, both
-- `is_active`) are the authoritative lists, the same ones GET /api/venues/options
-- serves. Each stored list is rewritten in place:
--   - a retired value with a current equivalent is renamed to it:
--       accessibility  'Wheelchair ramps', 'Step-free access' -> 'Wheelchair access'
--       facilities     'PA System'                            -> 'AV System'
--     ('Wheelchair ramps' -> 'Wheelchair access' is the mapping already used by
--     the SPM-52 venue search);
--   - any other value not in the current list is removed (for example the
--     'Quiet room', 'First aid station' and 'Sink access' seed values);
--   - duplicates created by a rename are removed, keeping the first position.
-- Rewritten: events, change requests (both proposed and original values) and,
-- when the table exists, saved event drafts. Not rewritten: the append-only
-- change-request audit log and the event change history, which record what was
-- true at the time.
-- Idempotent: a second run changes nothing.
-- Side effects to know before running it:
--   - Safety checks are reset. The SPM-135 trigger events_invalidate_safety deletes an
--     event's safety check whenever its facilities or accessibility needs change, so every
--     event this migration rewrites (Confirmed ones included) loses its safety check and the
--     coordinator must request it again. This is accepted (decision of 29 Oct 2026); no
--     reset reason is recorded.
--   - Flagged changes still awaiting review (event_flagged_changes, 'Needs Review') are not
--     rewritten. A pending facilities change that proposes a retired value (for example
--     'PA System') would write it back if the coordinator confirms it. Known limitation,
--     accepted on 29 Oct 2026 as a rare case.

CREATE OR REPLACE FUNCTION pg_temp.spm156_current_options(items text[], kind text)
RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(mapped ORDER BY first_position), '{}')
    FROM (
      SELECT mapped, min(position) AS first_position
        FROM (
          SELECT CASE
                   WHEN kind = 'accessibility' AND item IN ('Wheelchair ramps', 'Step-free access')
                     THEN 'Wheelchair access'
                   WHEN kind = 'facilities' AND item = 'PA System' THEN 'AV System'
                   ELSE item
                 END AS mapped,
                 position
            FROM unnest(items) WITH ORDINALITY AS t(item, position)
        ) renamed
       WHERE (kind = 'accessibility'
              AND mapped IN (SELECT label FROM accessibility_features WHERE is_active))
          OR (kind = 'facilities'
              AND mapped IN (SELECT name FROM facilities WHERE is_active))
       GROUP BY mapped
    ) kept
$$;

-- jsonb array of strings -> current options as a jsonb array (non-arrays unchanged).
CREATE OR REPLACE FUNCTION pg_temp.spm156_current_json(value jsonb, kind text)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN jsonb_typeof(value) = 'array' THEN to_jsonb(pg_temp.spm156_current_options(
             ARRAY(SELECT jsonb_array_elements_text(value)), kind))
           ELSE value
         END
$$;

UPDATE events
   SET accessibility_needs = pg_temp.spm156_current_options(accessibility_needs, 'accessibility')
 WHERE accessibility_needs IS DISTINCT FROM pg_temp.spm156_current_options(accessibility_needs, 'accessibility');

UPDATE events
   SET required_facilities = pg_temp.spm156_current_options(required_facilities, 'facilities')
 WHERE required_facilities IS DISTINCT FROM pg_temp.spm156_current_options(required_facilities, 'facilities');

-- Change requests store [{ field, originalValue, proposedValue }, ...].
UPDATE event_change_requests r
   SET changes = rewritten.changes
  FROM (
    SELECT id,
           jsonb_agg(
             CASE
               WHEN change->>'field' IN ('accessibility', 'facilities') THEN
                 change
                 || jsonb_build_object(
                      'originalValue', pg_temp.spm156_current_json(change->'originalValue', change->>'field'),
                      'proposedValue', pg_temp.spm156_current_json(change->'proposedValue', change->>'field'))
               ELSE change
             END
             ORDER BY position) AS changes
      FROM event_change_requests,
           jsonb_array_elements(changes) WITH ORDINALITY AS t(change, position)
     GROUP BY id
  ) rewritten
 WHERE r.id = rewritten.id
   AND r.changes IS DISTINCT FROM rewritten.changes;

-- Saved drafts (backend/migrations/001_event_drafts.sql) keep the form values in `fields`.
DO $$
BEGIN
  IF to_regclass('event_drafts') IS NOT NULL THEN
    UPDATE event_drafts
       SET fields = fields
                    || jsonb_build_object(
                         'accessibility', pg_temp.spm156_current_json(fields->'accessibility', 'accessibility'),
                         'facilities', pg_temp.spm156_current_json(fields->'facilities', 'facilities'))
     WHERE status = 'Draft'
       AND fields ? 'accessibility' AND fields ? 'facilities'
       AND (fields->'accessibility' IS DISTINCT FROM pg_temp.spm156_current_json(fields->'accessibility', 'accessibility')
            OR fields->'facilities' IS DISTINCT FROM pg_temp.spm156_current_json(fields->'facilities', 'facilities'));
  END IF;
END;
$$;
