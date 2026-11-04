-- SPM-157 Audit History of Important Actions.
--
-- event_audit_log is the append-only record of changes to an event and to its venue bookings,
-- equipment requests and registrations that no other table keeps a history of.
-- Also recorded: clarification requests, replies and resolution (event_comments), the coordinator's
-- response to safety feedback, the completion record, registration settings, and venue changes that
-- affect the event's booking (from the SPM-125 Coordinator notice). It is written by the
-- triggers below, so every path that changes those rows (service code, other triggers, the SPM-132 hold
-- decisions and expiry processing) is recorded without calling a helper.
--
-- Read together with the histories other stories already keep (read live by
-- backend/src/events/history/event-history.repository.ts, never copied here):
--   event_flagged_changes        flagged changes and applied information updates (SPM-85, SPM-156)
--   event_change_requests        change requests (SPM-64)
--   event_change_request_audit   change request outcomes (SPM-65)
--   event_cancellation_requests  cancellation requests and decisions (SPM-155)
--
-- Who made a change: the backend sets the transaction-local setting app.actor_id to the signed-in
-- user's id (backend/src/database/database.service.ts). A change made by another trigger
-- (pg_trigger_depth() > 1) or by a rule that is automatic by definition (waiting list promotion and
-- removal, safety check reset) is recorded as made by the system. actor_name keeps the person's
-- display name as it was at the time.
--
-- Entries loaded at release from earlier records (AC11) carry actor_kind 'unrecorded' when the earlier
-- record did not keep who made the change.

CREATE TABLE IF NOT EXISTS event_audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- No foreign key on purpose: a foreign key makes every recorded change take a key-share lock on the
    -- event row, which would block other requests' SELECT ... FOR UPDATE on the event until commit
    -- (found by the SPM-120 withdrawal race test). events_audit_cleanup removes an event's entries
    -- when the event itself is deleted.
    event_id uuid NOT NULL,
    section text NOT NULL CHECK (section IN ('event', 'venue_booking', 'equipment', 'registration')),
    action text NOT NULL CHECK (length(btrim(action)) > 0),
    subject_id uuid,
    subject_label text,
    changes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(changes) = 'array'),
    reason text,
    actor_id text,
    actor_name text,
    actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'system', 'unrecorded')),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT event_audit_log_actor_check CHECK (
        (actor_kind = 'user' AND actor_name IS NOT NULL)
        OR (actor_kind <> 'user' AND actor_id IS NULL AND actor_name IS NULL)
    )
);

ALTER TABLE event_audit_log DROP CONSTRAINT IF EXISTS event_audit_log_event_id_fkey;

CREATE INDEX IF NOT EXISTS event_audit_log_event_idx ON event_audit_log (event_id, occurred_at, id);

-- AC10: entries cannot be updated or deleted. The only delete allowed is the clean-up after the event
-- itself is deleted (tests and maintenance; the application never deletes events).
CREATE OR REPLACE FUNCTION event_audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM events WHERE id = OLD.event_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'event_audit_log is append-only' USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS event_audit_log_append_only ON event_audit_log;
CREATE TRIGGER event_audit_log_append_only BEFORE UPDATE OR DELETE ON event_audit_log
  FOR EACH ROW EXECUTE FUNCTION event_audit_log_append_only();

CREATE OR REPLACE FUNCTION trg_events_audit_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM event_audit_log WHERE event_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS events_audit_cleanup ON events;
CREATE TRIGGER events_audit_cleanup AFTER DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION trg_events_audit_cleanup();

-- One change as stored in event_audit_log.changes.
CREATE OR REPLACE FUNCTION audit_change(p_field text, p_from jsonb, p_to jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('field', p_field, 'from', p_from, 'to', p_to);
$$;

-- Writes one entry. p_actor names the user explicitly (for example the attendee who owns a
-- registration); otherwise the session user (app.actor_id) is used. p_system forces a system entry.
-- An event that no longer exists (mid-delete) gets no entry.
CREATE OR REPLACE FUNCTION record_event_audit(
  p_event_id uuid,
  p_section text,
  p_action text,
  p_subject_id uuid,
  p_subject_label text,
  p_changes jsonb,
  p_reason text,
  p_system boolean DEFAULT false,
  p_actor text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_actor text;
  v_name text;
BEGIN
  IF p_event_id IS NULL OR NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
    RETURN;
  END IF;
  IF NOT p_system THEN
    v_actor := COALESCE(p_actor, nullif(current_setting('app.actor_id', true), ''));
    IF v_actor IS NOT NULL THEN
      SELECT display_name INTO v_name FROM users WHERE id::text = v_actor;
    END IF;
  END IF;
  IF v_name IS NULL THEN
    v_actor := NULL;
  END IF;
  INSERT INTO event_audit_log
    (event_id, section, action, subject_id, subject_label, changes, reason, actor_id, actor_name, actor_kind)
  VALUES
    (p_event_id, p_section, p_action, p_subject_id, p_subject_label, COALESCE(p_changes, '[]'::jsonb),
     nullif(btrim(p_reason), ''), v_actor, v_name, CASE WHEN v_name IS NULL THEN 'system' ELSE 'user' END);
END;
$$;

-- Events: submission, status changes (with the rejection reason), coordinator assignment and the
-- registration settings (SPM-139).
CREATE OR REPLACE FUNCTION trg_events_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_changes jsonb := '[]'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM record_event_audit(NEW.id, 'event', 'submitted', NULL, NULL,
      jsonb_build_array(audit_change('status', NULL, to_jsonb(NEW.status))), NULL, false, NEW.organiser_id);
    IF NEW.coordinator_id IS NOT NULL THEN
      PERFORM record_event_audit(NEW.id, 'event', 'coordinator_assigned', NULL, NULL,
        jsonb_build_array(audit_change('coordinator', NULL, to_jsonb(NEW.coordinator_name))), NULL);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM record_event_audit(NEW.id, 'event', 'status_changed', NULL, NULL,
      jsonb_build_array(audit_change('status', to_jsonb(OLD.status), to_jsonb(NEW.status))),
      CASE WHEN NEW.status = 'Rejected' THEN NEW.rejection_reason END,
      pg_trigger_depth() > 1);
  END IF;
  IF NEW.coordinator_id IS DISTINCT FROM OLD.coordinator_id THEN
    PERFORM record_event_audit(NEW.id, 'event',
      CASE WHEN OLD.coordinator_id IS NULL THEN 'coordinator_assigned'
           WHEN NEW.coordinator_id IS NULL THEN 'coordinator_unassigned'
           ELSE 'coordinator_reassigned' END,
      NULL, NULL,
      jsonb_build_array(audit_change('coordinator', to_jsonb(OLD.coordinator_name), to_jsonb(NEW.coordinator_name))),
      NULL, pg_trigger_depth() > 1);
  END IF;
  IF NEW.registration_enabled IS DISTINCT FROM OLD.registration_enabled THEN
    v_changes := v_changes || jsonb_build_array(
      audit_change('registrationEnabled', to_jsonb(OLD.registration_enabled), to_jsonb(NEW.registration_enabled)));
  END IF;
  IF NEW.registration_opens_at IS DISTINCT FROM OLD.registration_opens_at THEN
    v_changes := v_changes || jsonb_build_array(
      audit_change('registrationOpensAt', to_jsonb(OLD.registration_opens_at), to_jsonb(NEW.registration_opens_at)));
  END IF;
  IF NEW.registration_closes_at IS DISTINCT FROM OLD.registration_closes_at THEN
    v_changes := v_changes || jsonb_build_array(
      audit_change('registrationClosesAt', to_jsonb(OLD.registration_closes_at), to_jsonb(NEW.registration_closes_at)));
  END IF;
  IF NEW.registration_limit IS DISTINCT FROM OLD.registration_limit THEN
    v_changes := v_changes || jsonb_build_array(
      audit_change('registrationLimit', to_jsonb(OLD.registration_limit), to_jsonb(NEW.registration_limit)));
  END IF;
  IF jsonb_array_length(v_changes) > 0 THEN
    PERFORM record_event_audit(NEW.id, 'registration', 'registration_settings_changed', NULL, NULL, v_changes,
      NULL, pg_trigger_depth() > 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_audit ON events;
CREATE TRIGGER events_audit AFTER INSERT OR UPDATE OF status, coordinator_id, registration_enabled,
  registration_opens_at, registration_closes_at, registration_limit ON events
  FOR EACH ROW EXECUTE FUNCTION trg_events_audit();

-- Venue bookings and tentative holds (blockouts have no event and are not recorded here; SPM-125
-- keeps their history).
CREATE OR REPLACE FUNCTION trg_venue_bookings_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_row venue_bookings%ROWTYPE;
  v_hold boolean;
  v_venue text;
  v_action text;
  v_changes jsonb;
  v_system boolean := pg_trigger_depth() > 1;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF v_row.event_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_hold := v_row.request_kind = 'tentative_hold';
  SELECT name INTO v_venue FROM venues WHERE id = v_row.venue_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM record_event_audit(NEW.event_id, 'venue_booking',
      CASE WHEN v_hold THEN 'hold_requested' ELSE 'booking_requested' END, NEW.id, v_venue,
      jsonb_build_array(audit_change('status', NULL, to_jsonb(NEW.status)),
                        audit_change('start', NULL, to_jsonb(NEW.start_at)),
                        audit_change('end', NULL, to_jsonb(NEW.end_at))),
      NULL, v_system);
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM record_event_audit(OLD.event_id, 'venue_booking',
      CASE WHEN v_hold THEN 'hold_removed' ELSE 'booking_removed' END, OLD.id, v_venue,
      jsonb_build_array(audit_change('status', to_jsonb(OLD.status), NULL)), NULL, v_system);
    RETURN NULL;
  END IF;

  -- SPM-132: the expiry processor marks an elapsed hold 'expired' after the fact. The history shows that expiry once,
  -- at hold_expires_at and as the system's, from the hold itself (event-history.repository.ts), not a second time here.
  IF NEW.status = 'expired' AND OLD.status IS DISTINCT FROM 'expired' THEN
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'approved' THEN CASE WHEN v_hold THEN 'hold_placed' ELSE 'booking_approved' END
      WHEN 'rejected' THEN CASE WHEN v_hold THEN 'hold_rejected' ELSE 'booking_rejected' END
      WHEN 'cancelled' THEN CASE WHEN v_hold THEN 'hold_cancelled' ELSE 'booking_cancelled' END
      WHEN 'released' THEN CASE WHEN v_hold THEN 'hold_released' ELSE 'booking_released' END
      WHEN 'pending' THEN CASE WHEN v_hold THEN 'hold_returned_for_review' ELSE 'booking_returned_for_review' END
      ELSE 'booking_status_changed' END;
    v_changes := jsonb_build_array(audit_change('status', to_jsonb(OLD.status), to_jsonb(NEW.status)));
    IF v_hold AND NEW.hold_expires_at IS DISTINCT FROM OLD.hold_expires_at THEN
      v_changes := v_changes || jsonb_build_array(
        audit_change('holdExpiresAt', to_jsonb(OLD.hold_expires_at), to_jsonb(NEW.hold_expires_at)));
    END IF;
    PERFORM record_event_audit(NEW.event_id, 'venue_booking', v_action, NEW.id, v_venue, v_changes,
      CASE WHEN NEW.status = 'rejected' THEN NEW.rejection_reason END, v_system);
  ELSIF v_hold AND NEW.hold_expires_at IS DISTINCT FROM OLD.hold_expires_at THEN
    PERFORM record_event_audit(NEW.event_id, 'venue_booking', 'hold_expiry_changed', NEW.id, v_venue,
      jsonb_build_array(audit_change('holdExpiresAt', to_jsonb(OLD.hold_expires_at), to_jsonb(NEW.hold_expires_at))),
      NULL, v_system);
  END IF;

  IF NEW.request_kind IS DISTINCT FROM OLD.request_kind THEN
    PERFORM record_event_audit(NEW.event_id, 'venue_booking',
      CASE WHEN OLD.request_kind = 'tentative_hold' THEN 'hold_converted' ELSE 'booking_kind_changed' END,
      NEW.id, v_venue,
      jsonb_build_array(audit_change('requestKind', to_jsonb(OLD.request_kind), to_jsonb(NEW.request_kind))),
      NULL, v_system);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS venue_bookings_audit ON venue_bookings;
CREATE TRIGGER venue_bookings_audit AFTER INSERT OR UPDATE OR DELETE ON venue_bookings
  FOR EACH ROW EXECUTE FUNCTION trg_venue_bookings_audit();

-- The items of an equipment request, e.g. '2 x Wireless microphone, 1 x Projector'.
CREATE OR REPLACE FUNCTION equipment_request_items_label(p_request_id uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT string_agg(item.quantity || ' x ' || item.equipment_name, ', ' ORDER BY item.item_order, item.created_at, item.id)
    FROM equipment_request_items item
   WHERE item.request_id = p_request_id;
$$;

-- A new request is recorded at commit, when its items have been saved.
CREATE OR REPLACE FUNCTION trg_equipment_requests_audit_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM record_event_audit(NEW.event_id, 'equipment', 'equipment_requested', NEW.id,
    equipment_request_items_label(NEW.id),
    jsonb_build_array(audit_change('status', NULL, to_jsonb(NEW.status))), NULL, false, NEW.requested_by::text);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS equipment_requests_audit_insert ON equipment_requests;
CREATE CONSTRAINT TRIGGER equipment_requests_audit_insert AFTER INSERT ON equipment_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_equipment_requests_audit_insert();

-- Status decisions, and edits of the items (SPM-57: every edit sets the status, so this trigger sees it). The
-- items before an edit are the subject of the request's last entry.
CREATE OR REPLACE FUNCTION trg_equipment_requests_audit_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_items text := equipment_request_items_label(NEW.id);
  v_previous text;
  v_items_change jsonb := '[]'::jsonb;
BEGIN
  SELECT subject_label INTO v_previous
    FROM event_audit_log
   WHERE subject_id = NEW.id AND section = 'equipment'
   ORDER BY id DESC LIMIT 1;
  IF v_previous IS NOT NULL AND v_items IS DISTINCT FROM v_previous THEN
    v_items_change := jsonb_build_array(audit_change('items', to_jsonb(v_previous), to_jsonb(v_items)));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM record_event_audit(NEW.event_id, 'equipment',
      CASE NEW.status
        WHEN 'Reserved' THEN 'equipment_reserved'
        WHEN 'Cannot Provide' THEN 'equipment_cannot_provide'
        WHEN 'Pending Review' THEN 'equipment_returned_for_review'
        WHEN 'Unavailable' THEN 'equipment_unavailable'
        WHEN 'Cancelled' THEN 'equipment_cancelled'
        ELSE 'equipment_status_changed' END,
      NEW.id, v_items,
      jsonb_build_array(audit_change('status', to_jsonb(OLD.status), to_jsonb(NEW.status))) || v_items_change,
      CASE WHEN NEW.status = 'Cannot Provide' THEN NEW.decision_reason END,
      pg_trigger_depth() > 1);
  ELSIF jsonb_array_length(v_items_change) > 0 THEN
    PERFORM record_event_audit(NEW.event_id, 'equipment', 'equipment_request_updated', NEW.id, v_items,
      v_items_change, NULL, pg_trigger_depth() > 1);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS equipment_requests_audit_update ON equipment_requests;
CREATE TRIGGER equipment_requests_audit_update AFTER UPDATE OF status ON equipment_requests
  FOR EACH ROW EXECUTE FUNCTION trg_equipment_requests_audit_update();

-- Released equipment items (SPM-136 cancellation release).
CREATE OR REPLACE FUNCTION trg_equipment_reservations_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'Released' AND OLD.status IS DISTINCT FROM 'Released' THEN
    PERFORM record_event_audit(NEW.event_id, 'equipment', 'equipment_released', NEW.id,
      NEW.quantity || ' x ' || NEW.equipment_name,
      jsonb_build_array(audit_change('status', to_jsonb(OLD.status), to_jsonb(NEW.status))),
      NULL, pg_trigger_depth() > 1);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS equipment_reservations_audit ON equipment_reservations;
CREATE TRIGGER equipment_reservations_audit AFTER UPDATE OF status ON equipment_reservations
  FOR EACH ROW EXECUTE FUNCTION trg_equipment_reservations_audit();

-- Registrations and waiting list entries. A registration row is reused when the attendee registers
-- again, so each status change is its own entry.
CREATE OR REPLACE FUNCTION trg_event_registrations_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_label text;
  v_action text;
  v_system boolean := pg_trigger_depth() > 1;
  v_actor text;
BEGIN
  SELECT COALESCE(nullif(btrim(NEW.full_name), ''), u.display_name) INTO v_label
    FROM (SELECT 1) one LEFT JOIN users u ON u.id = NEW.attendee_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM record_event_audit(NEW.event_id, 'registration',
      CASE WHEN NEW.status = 'Waitlisted' THEN 'waitlist_joined' ELSE 'registered' END,
      NEW.id, v_label, jsonb_build_array(audit_change('status', NULL, to_jsonb(NEW.status))),
      NULL, v_system, NEW.attendee_id::text);
    RETURN NULL;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  v_action := CASE
    WHEN OLD.status = 'Waitlisted' AND NEW.status = 'Registered' THEN 'waitlist_promoted'
    WHEN NEW.status = 'Registered' THEN 'registered'
    WHEN NEW.status = 'Waitlisted' THEN 'waitlist_joined'
    WHEN OLD.status = 'Waitlisted' AND NEW.status = 'Withdrawn' THEN 'waitlist_left'
    WHEN NEW.status = 'Withdrawn' THEN 'registration_withdrawn'
    WHEN NEW.status = 'Removed' THEN 'waitlist_removed'
    WHEN NEW.status = 'Cancelled' THEN 'registration_cancelled'
    ELSE 'registration_status_changed' END;
  -- Promotion and removal follow from the waiting list rules (SPM-138), not from a choice.
  v_system := v_system OR v_action IN ('waitlist_promoted', 'waitlist_removed');
  -- Joining, registering and withdrawing are always the attendee's own action.
  IF v_action IN ('registered', 'waitlist_joined', 'waitlist_left', 'registration_withdrawn') THEN
    v_actor := NEW.attendee_id::text;
  END IF;
  PERFORM record_event_audit(NEW.event_id, 'registration', v_action, NEW.id, v_label,
    jsonb_build_array(audit_change('status', to_jsonb(OLD.status), to_jsonb(NEW.status))),
    CASE WHEN NEW.status = 'Cancelled' THEN NEW.cancellation_reason END, v_system, v_actor);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS event_registrations_audit ON event_registrations;
CREATE TRIGGER event_registrations_audit AFTER INSERT OR UPDATE OF status ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION trg_event_registrations_audit();

-- Safety check requests and outcomes. Recorded at commit so the outcome's feedback items, saved after
-- the decision in the same transaction, are the reason.
CREATE OR REPLACE FUNCTION trg_event_safety_checks_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_reason text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.requested_at IS NOT DISTINCT FROM OLD.requested_at
     AND NEW.decided_at IS NOT DISTINCT FROM OLD.decided_at THEN
    RETURN NULL;
  END IF;
  IF NEW.status IN ('changes_needed', 'rejected') THEN
    SELECT string_agg(item.feedback_text, E'\n' ORDER BY item.requested_at, item.id) INTO v_reason
      FROM safety_check_feedback_items item
     WHERE item.event_id = NEW.event_id;
    v_reason := COALESCE(v_reason, NEW.feedback);
  END IF;
  PERFORM record_event_audit(NEW.event_id, 'event',
    CASE NEW.status
      WHEN 'pending' THEN 'safety_check_requested'
      WHEN 'approved' THEN 'safety_check_approved'
      WHEN 'changes_needed' THEN 'safety_changes_requested'
      WHEN 'rejected' THEN 'safety_check_rejected'
      ELSE 'safety_check_changed' END,
    NULL, NULL,
    jsonb_build_array(audit_change('safetyCheck',
      CASE WHEN TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN to_jsonb(OLD.status) END,
      to_jsonb(NEW.status))),
    v_reason);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS event_safety_checks_audit ON event_safety_checks;
CREATE CONSTRAINT TRIGGER event_safety_checks_audit AFTER INSERT OR UPDATE ON event_safety_checks
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_event_safety_checks_audit();

-- A safety check reset (invalidate_safety_check) is always the system's, with its stored reason.
CREATE OR REPLACE FUNCTION trg_event_safety_resets_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM record_event_audit(NEW.event_id, 'event', 'safety_check_reset', NULL, NULL,
    '[]'::jsonb, NEW.reason, true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS event_safety_resets_audit ON event_safety_resets;
CREATE TRIGGER event_safety_resets_audit AFTER INSERT OR UPDATE ON event_safety_resets
  FOR EACH ROW EXECUTE FUNCTION trg_event_safety_resets_audit();

-- Clarification requests, replies and their resolution (SPM-39). The author is the comment's author.
CREATE OR REPLACE FUNCTION trg_event_comments_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_question text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'reply' THEN
      SELECT message INTO v_question FROM event_comments WHERE id = NEW.parent_id;
    END IF;
    PERFORM record_event_audit(NEW.event_id, 'event',
      CASE WHEN NEW.type = 'clarification' THEN 'clarification_requested' ELSE 'clarification_replied' END,
      NEW.id, v_question, jsonb_build_array(audit_change('message', NULL, to_jsonb(NEW.message))),
      NULL, false, NEW.author_id);
  ELSIF NEW.resolved AND NOT OLD.resolved THEN
    PERFORM record_event_audit(NEW.event_id, 'event', 'clarification_resolved', NEW.id, NEW.message,
      '[]'::jsonb, NULL, pg_trigger_depth() > 1);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS event_comments_audit ON event_comments;
CREATE TRIGGER event_comments_audit AFTER INSERT OR UPDATE OF resolved ON event_comments
  FOR EACH ROW EXECUTE FUNCTION trg_event_comments_audit();

-- The coordinator's response to each Safety Officer feedback item (SPM-131).
CREATE OR REPLACE FUNCTION trg_safety_feedback_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.resolved_by_coordinator_at IS NOT NULL AND OLD.resolved_by_coordinator_at IS NULL THEN
    PERFORM record_event_audit(NEW.event_id, 'event', 'safety_feedback_resolved', NEW.id, NEW.feedback_text,
      '[]'::jsonb, NULL, pg_trigger_depth() > 1);
  ELSIF NEW.resolved_by_coordinator_at IS NULL AND OLD.resolved_by_coordinator_at IS NOT NULL THEN
    PERFORM record_event_audit(NEW.event_id, 'event', 'safety_feedback_reopened', NEW.id, NEW.feedback_text,
      '[]'::jsonb, NULL, pg_trigger_depth() > 1);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS safety_feedback_audit ON safety_check_feedback_items;
CREATE TRIGGER safety_feedback_audit AFTER UPDATE OF resolved_by_coordinator_at ON safety_check_feedback_items
  FOR EACH ROW EXECUTE FUNCTION trg_safety_feedback_audit();

-- The completion record (SPM-153): attendance, operational notes and issues. Recorded at commit, when the
-- issues have been saved; the issues before are those of the last completion entry.
CREATE OR REPLACE FUNCTION trg_completion_records_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_changes jsonb := '[]'::jsonb;
  v_issues jsonb;
  v_previous jsonb;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.attendance_count IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.attendance_count IS DISTINCT FROM OLD.attendance_count) THEN
    v_changes := v_changes || jsonb_build_array(audit_change('attendanceCount',
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD.attendance_count) END, to_jsonb(NEW.attendance_count)));
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.operational_notes IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.operational_notes IS DISTINCT FROM OLD.operational_notes) THEN
    v_changes := v_changes || jsonb_build_array(audit_change('operationalNotes',
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD.operational_notes) END, to_jsonb(NEW.operational_notes)));
  END IF;
  SELECT COALESCE(jsonb_agg(issue.description ORDER BY issue.position), '[]'::jsonb) INTO v_issues
    FROM completion_record_issues issue WHERE issue.event_id = NEW.event_id;
  SELECT change->'to' INTO v_previous
    FROM event_audit_log entry CROSS JOIN LATERAL jsonb_array_elements(entry.changes) change
   WHERE entry.event_id = NEW.event_id AND entry.action = 'completion_record_saved' AND change->>'field' = 'issues'
   ORDER BY entry.id DESC LIMIT 1;
  IF v_issues IS DISTINCT FROM COALESCE(v_previous, '[]'::jsonb) THEN
    v_changes := v_changes || jsonb_build_array(audit_change('issues', v_previous, v_issues));
  END IF;
  IF jsonb_array_length(v_changes) > 0 THEN
    PERFORM record_event_audit(NEW.event_id, 'event', 'completion_record_saved', NULL, NULL, v_changes, NULL);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS completion_records_audit ON completion_records;
CREATE CONSTRAINT TRIGGER completion_records_audit AFTER INSERT OR UPDATE ON completion_records
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_completion_records_audit();

-- A venue change that affects the event's booking (SPM-125: unavailable period, timing or capacity). The
-- affected bookings are decided once, by SPM-122 and SPM-121, when the Coordinator's notice is written
-- (src/venues/notifications/venue-impact-notifications.ts); the entry follows that notice and keeps its text.
CREATE OR REPLACE FUNCTION trg_venue_impact_notice_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_venue text;
BEGIN
  IF NEW.type NOT IN ('venue_unavailable_impact', 'venue_timing_impact', 'venue_capacity_impact')
     OR NEW.related_event_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT v.name INTO v_venue FROM venue_bookings b JOIN venues v ON v.id = b.venue_id WHERE b.id = NEW.related_booking_id;
  PERFORM record_event_audit(NEW.related_event_id, 'venue_booking',
    CASE NEW.type WHEN 'venue_unavailable_impact' THEN 'venue_unavailable'
                  WHEN 'venue_timing_impact' THEN 'venue_timing_changed'
                  ELSE 'venue_capacity_changed' END,
    NEW.related_booking_id, v_venue, '[]'::jsonb, NEW.message, pg_trigger_depth() > 1);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS venue_impact_notice_audit ON notifications;
CREATE TRIGGER venue_impact_notice_audit AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION trg_venue_impact_notice_audit();

-- AC11: load what earlier records already show, once (only into an empty log). Change requests,
-- flagged changes and cancellation requests are read live and are not copied.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM event_audit_log) THEN
    RETURN;
  END IF;

  -- Submissions.
  INSERT INTO event_audit_log (event_id, section, action, changes, actor_id, actor_name, actor_kind, occurred_at)
  SELECT e.id, 'event', 'submitted',
         jsonb_build_array(audit_change('status', NULL, to_jsonb('Submitted'::text))),
         CASE WHEN u.id IS NOT NULL THEN e.organiser_id END,
         CASE WHEN u.id IS NOT NULL THEN u.display_name END,
         CASE WHEN u.id IS NOT NULL THEN 'user' ELSE 'unrecorded' END,
         e.created_at
    FROM events e LEFT JOIN users u ON u.id::text = e.organiser_id;

  -- Status history (SPM-148, SPM-153, SPM-135, SPM-136, SPM-65).
  INSERT INTO event_audit_log (event_id, section, action, changes, actor_id, actor_name, actor_kind, occurred_at)
  SELECT h.event_id, 'event', 'status_changed',
         jsonb_build_array(audit_change('status', to_jsonb(h.from_status), to_jsonb(h.to_status))),
         CASE WHEN u.id IS NOT NULL THEN h.actor_id END,
         CASE WHEN u.id IS NOT NULL THEN u.display_name END,
         CASE WHEN u.id IS NOT NULL THEN 'user' WHEN lower(h.actor_id) = 'system' THEN 'system' ELSE 'unrecorded' END,
         h.created_at
    FROM event_status_history h LEFT JOIN users u ON u.id::text = h.actor_id;

  -- Reassignments (SPM-46, SPM-47).
  INSERT INTO event_audit_log (event_id, section, action, changes, actor_id, actor_name, actor_kind, occurred_at)
  SELECT r.event_id, 'event', 'coordinator_reassigned',
         jsonb_build_array(audit_change('coordinator', to_jsonb(r.from_coordinator_name), to_jsonb(r.to_coordinator_name))),
         CASE WHEN u.id IS NOT NULL THEN r.reassigned_by END,
         CASE WHEN u.id IS NOT NULL THEN u.display_name END,
         CASE WHEN u.id IS NOT NULL THEN 'user' ELSE 'unrecorded' END,
         r.reassigned_at
    FROM event_reassignments r LEFT JOIN users u ON u.id::text = r.reassigned_by;

  -- Safety check: the current request and outcome, and the last reset.
  INSERT INTO event_audit_log (event_id, section, action, changes, actor_id, actor_name, actor_kind, occurred_at)
  SELECT s.event_id, 'event', 'safety_check_requested',
         jsonb_build_array(audit_change('safetyCheck', NULL, to_jsonb('pending'::text))),
         CASE WHEN u.id IS NOT NULL THEN s.requested_by END,
         CASE WHEN u.id IS NOT NULL THEN u.display_name END,
         CASE WHEN u.id IS NOT NULL THEN 'user' ELSE 'unrecorded' END,
         s.requested_at
    FROM event_safety_checks s LEFT JOIN users u ON u.id::text = s.requested_by;

  INSERT INTO event_audit_log (event_id, section, action, changes, reason, actor_name, actor_kind, occurred_at)
  SELECT s.event_id, 'event',
         CASE s.status WHEN 'approved' THEN 'safety_check_approved'
                       WHEN 'changes_needed' THEN 'safety_changes_requested'
                       ELSE 'safety_check_rejected' END,
         jsonb_build_array(audit_change('safetyCheck', to_jsonb('pending'::text), to_jsonb(s.status))),
         COALESCE((SELECT string_agg(f.feedback_text, E'\n' ORDER BY f.requested_at, f.id)
                     FROM safety_check_feedback_items f WHERE f.event_id = s.event_id), s.feedback),
         nullif(btrim(s.approver_name), ''),
         CASE WHEN nullif(btrim(s.approver_name), '') IS NOT NULL THEN 'user' ELSE 'unrecorded' END,
         s.decided_at
    FROM event_safety_checks s
   WHERE s.status <> 'pending' AND s.decided_at IS NOT NULL;

  INSERT INTO event_audit_log (event_id, section, action, reason, actor_kind, occurred_at)
  SELECT r.event_id, 'event', 'safety_check_reset', r.reason, 'system', r.reset_at
    FROM event_safety_resets r;

  -- Venue bookings and holds: the request (author not recorded), review decisions (SPM-55 review
  -- log) and releases on cancellation (SPM-136, author not recorded).
  INSERT INTO event_audit_log (event_id, section, action, subject_id, subject_label, changes, actor_kind, occurred_at)
  SELECT b.event_id, 'venue_booking',
         CASE WHEN b.request_kind = 'tentative_hold' THEN 'hold_requested' ELSE 'booking_requested' END,
         b.id, v.name,
         jsonb_build_array(audit_change('status', NULL, to_jsonb('pending'::text)),
                           audit_change('start', NULL, to_jsonb(b.start_at)),
                           audit_change('end', NULL, to_jsonb(b.end_at))),
         'unrecorded', b.created_at
    FROM venue_bookings b JOIN venues v ON v.id = b.venue_id
   WHERE b.event_id IS NOT NULL;

  INSERT INTO event_audit_log
    (event_id, section, action, subject_id, subject_label, changes, reason, actor_id, actor_name, actor_kind, occurred_at)
  SELECT b.event_id, 'venue_booking',
         CASE WHEN log.action = 'approved' AND b.request_kind = 'tentative_hold' THEN 'hold_placed'
              WHEN log.action = 'approved' THEN 'booking_approved'
              WHEN b.request_kind = 'tentative_hold' THEN 'hold_rejected'
              ELSE 'booking_rejected' END,
         b.id, v.name,
         jsonb_build_array(audit_change('status', to_jsonb('pending'::text), to_jsonb(log.action))),
         log.reason, log.actor_user_id::text, u.display_name, 'user', log.created_at
    FROM booking_review_log log
    JOIN venue_bookings b ON b.id = log.booking_id
    JOIN venues v ON v.id = b.venue_id
    JOIN users u ON u.id = log.actor_user_id
   WHERE b.event_id IS NOT NULL;

  INSERT INTO event_audit_log (event_id, section, action, subject_id, subject_label, changes, actor_kind, occurred_at)
  SELECT b.event_id, 'venue_booking',
         CASE WHEN b.request_kind = 'tentative_hold' THEN 'hold_released' ELSE 'booking_released' END,
         b.id, v.name,
         jsonb_build_array(audit_change('status', NULL, to_jsonb('released'::text))),
         'unrecorded', b.released_at
    FROM venue_bookings b JOIN venues v ON v.id = b.venue_id
   WHERE b.event_id IS NOT NULL AND b.released_at IS NOT NULL;

  -- Equipment requests (the requester is recorded) and released items.
  INSERT INTO event_audit_log
    (event_id, section, action, subject_id, subject_label, changes, actor_id, actor_name, actor_kind, occurred_at)
  SELECT r.event_id, 'equipment', 'equipment_requested', r.id, equipment_request_items_label(r.id),
         jsonb_build_array(audit_change('status', NULL, to_jsonb('Pending Review'::text))),
         r.requested_by::text, u.display_name, 'user', r.created_at
    FROM equipment_requests r JOIN users u ON u.id = r.requested_by;

  INSERT INTO event_audit_log (event_id, section, action, subject_id, subject_label, changes, actor_kind, occurred_at)
  SELECT res.event_id, 'equipment', 'equipment_released', res.id, res.quantity || ' x ' || res.equipment_name,
         jsonb_build_array(audit_change('status', NULL, to_jsonb('Released'::text))),
         'unrecorded', res.released_at
    FROM equipment_reservations res
   WHERE res.released_at IS NOT NULL;

  -- Registrations: the attendee's own actions, and the waiting list rules.
  INSERT INTO event_audit_log
    (event_id, section, action, subject_id, subject_label, changes, actor_id, actor_name, actor_kind, occurred_at)
  SELECT r.event_id, 'registration',
         CASE WHEN r.joined_at IS NOT NULL THEN 'waitlist_joined' ELSE 'registered' END,
         r.id, COALESCE(nullif(btrim(r.full_name), ''), u.display_name),
         jsonb_build_array(audit_change('status', NULL,
           to_jsonb(CASE WHEN r.joined_at IS NOT NULL THEN 'Waitlisted' ELSE 'Registered' END))),
         r.attendee_id::text, u.display_name, 'user',
         COALESCE(r.joined_at, r.registered_at, r.created_at)
    FROM event_registrations r JOIN users u ON u.id = r.attendee_id;

  INSERT INTO event_audit_log (event_id, section, action, subject_id, subject_label, changes, actor_kind, occurred_at)
  SELECT r.event_id, 'registration', 'waitlist_promoted', r.id, COALESCE(nullif(btrim(r.full_name), ''), u.display_name),
         jsonb_build_array(audit_change('status', to_jsonb('Waitlisted'::text), to_jsonb('Registered'::text))),
         'system', r.registered_at
    FROM event_registrations r JOIN users u ON u.id = r.attendee_id
   WHERE r.joined_at IS NOT NULL AND r.registered_at IS NOT NULL;

  INSERT INTO event_audit_log
    (event_id, section, action, subject_id, subject_label, changes, actor_id, actor_name, actor_kind, occurred_at)
  SELECT r.event_id, 'registration',
         CASE WHEN r.joined_at IS NOT NULL AND r.registered_at IS NULL THEN 'waitlist_left' ELSE 'registration_withdrawn' END,
         r.id, COALESCE(nullif(btrim(r.full_name), ''), u.display_name),
         jsonb_build_array(audit_change('status',
           to_jsonb(CASE WHEN r.joined_at IS NOT NULL AND r.registered_at IS NULL THEN 'Waitlisted' ELSE 'Registered' END),
           to_jsonb('Withdrawn'::text))),
         r.attendee_id::text, u.display_name, 'user', r.withdrawn_at
    FROM event_registrations r JOIN users u ON u.id = r.attendee_id
   WHERE r.withdrawn_at IS NOT NULL;

  INSERT INTO event_audit_log (event_id, section, action, subject_id, subject_label, changes, actor_kind, occurred_at)
  SELECT r.event_id, 'registration', 'waitlist_removed', r.id, COALESCE(nullif(btrim(r.full_name), ''), u.display_name),
         jsonb_build_array(audit_change('status', to_jsonb('Waitlisted'::text), to_jsonb('Removed'::text))),
         'system', r.removed_at
    FROM event_registrations r JOIN users u ON u.id = r.attendee_id
   WHERE r.removed_at IS NOT NULL;

  INSERT INTO event_audit_log
    (event_id, section, action, subject_id, subject_label, changes, reason, actor_kind, occurred_at)
  SELECT r.event_id, 'registration', 'registration_cancelled', r.id, COALESCE(nullif(btrim(r.full_name), ''), u.display_name),
         jsonb_build_array(audit_change('status', NULL, to_jsonb('Cancelled'::text))),
         r.cancellation_reason, 'unrecorded', r.updated_at
    FROM event_registrations r JOIN users u ON u.id = r.attendee_id
   WHERE r.status = 'Cancelled';

  -- Clarification requests and replies (SPM-39; the resolution time was not stored).
  INSERT INTO event_audit_log
    (event_id, section, action, subject_id, subject_label, changes, actor_id, actor_name, actor_kind, occurred_at)
  SELECT c.event_id, 'event',
         CASE WHEN c.type = 'clarification' THEN 'clarification_requested' ELSE 'clarification_replied' END,
         c.id, parent.message,
         jsonb_build_array(audit_change('message', NULL, to_jsonb(c.message))),
         CASE WHEN u.id IS NOT NULL THEN c.author_id END, c.author_name, 'user', c.created_at
    FROM event_comments c
    LEFT JOIN event_comments parent ON parent.id = c.parent_id
    LEFT JOIN users u ON u.id::text = c.author_id;

  -- Responses to safety feedback items (SPM-131; who responded was not stored).
  INSERT INTO event_audit_log (event_id, section, action, subject_id, subject_label, actor_kind, occurred_at)
  SELECT f.event_id, 'event', 'safety_feedback_resolved', f.id, f.feedback_text, 'unrecorded', f.resolved_by_coordinator_at
    FROM safety_check_feedback_items f
   WHERE f.resolved_by_coordinator_at IS NOT NULL;

  -- The current completion record (SPM-153).
  INSERT INTO event_audit_log (event_id, section, action, changes, actor_id, actor_name, actor_kind, occurred_at)
  SELECT r.event_id, 'event', 'completion_record_saved',
         jsonb_build_array(audit_change('attendanceCount', NULL, to_jsonb(r.attendance_count)),
                           audit_change('operationalNotes', NULL, to_jsonb(r.operational_notes)),
                           audit_change('issues', NULL, COALESCE((SELECT jsonb_agg(i.description ORDER BY i.position)
                             FROM completion_record_issues i WHERE i.event_id = r.event_id), '[]'::jsonb))),
         CASE WHEN u.id IS NOT NULL THEN r.updated_by END,
         CASE WHEN u.id IS NOT NULL THEN u.display_name END,
         CASE WHEN u.id IS NOT NULL THEN 'user' ELSE 'unrecorded' END,
         r.updated_at
    FROM completion_records r LEFT JOIN users u ON u.id::text = r.updated_by;

  -- Venue changes that affected a booking (SPM-125 notices; the Venue Staff member is not on the notice).
  INSERT INTO event_audit_log (event_id, section, action, subject_id, subject_label, reason, actor_kind, occurred_at)
  SELECT n.related_event_id, 'venue_booking',
         CASE n.type WHEN 'venue_unavailable_impact' THEN 'venue_unavailable'
                     WHEN 'venue_timing_impact' THEN 'venue_timing_changed'
                     ELSE 'venue_capacity_changed' END,
         n.related_booking_id, v.name, n.message, 'unrecorded', n.created_at
    FROM notifications n
    LEFT JOIN venue_bookings b ON b.id = n.related_booking_id
    LEFT JOIN venues v ON v.id = b.venue_id
   WHERE n.type IN ('venue_unavailable_impact', 'venue_timing_impact', 'venue_capacity_impact')
     AND n.related_event_id IS NOT NULL;
END;
$$;
