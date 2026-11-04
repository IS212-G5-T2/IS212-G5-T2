// SPM-157 backend mutants: the audit history of important actions. Covers the wording and ordering rules of the
// pure mapper, who may read which sections (service), the read-only routes (controller), how the signed-in user
// reaches the database (actor context, middleware, DatabaseService), and the event_audit_log triggers in
// migrations/034 (the e2e suite re-applies that file, so SQL mutants are run there). Each mutant maps to the
// AUDIT-HISTORY tests that kill it.
//
//   DATABASE_URL=... node scripts/mutation/run.mjs --mutants spm157.mutants.mjs
//
// Use a disposable database: the e2e suite re-applies the mutated migration, and the next mutant's run re-applies
// the original before its tests.
const MAPPER_SPEC = 'src/events/history/event-history.mapper.spec.ts';
const SERVICE_SPEC = 'src/events/history/event-history.service.spec.ts';
const CONTROLLER_SPEC = 'src/events/history/event-history.controller.spec.ts';
const ACTOR_SPEC = 'src/common/actor-context.spec.ts';
const DATABASE_SPEC = 'src/database/database.service.spec.ts';
const MIDDLEWARE_SPEC = 'src/auth/authentication/authentication.middleware.spec.ts';
const E2E = 'test/event-history.e2e-spec.ts';
const MAPPER = 'src/events/history/event-history.mapper.ts';
const SERVICE = 'src/events/history/event-history.service.ts';
const CONTROLLER = 'src/events/history/event-history.controller.ts';
const ACTOR = 'src/common/actor-context.ts';
const DATABASE = 'src/database/database.service.ts';
const MIDDLEWARE = 'src/auth/authentication/authentication.middleware.ts';
const MIGRATION = 'migrations/034_spm157_event_audit_log.sql';

const map = (suite, file, ...titles) => titles.map((title) => ({ suite, file, title }));
const mapper = (...titles) => map('backendUnit', MAPPER_SPEC, ...titles);
const service = (...titles) => map('backendUnit', SERVICE_SPEC, ...titles);
const controller = (...titles) => map('backendUnit', CONTROLLER_SPEC, ...titles);
const actor = (...titles) => map('backendUnit', ACTOR_SPEC, ...titles);
const database = (...titles) => map('backendUnit', DATABASE_SPEC, ...titles);
const middleware = (...titles) => map('backendUnit', MIDDLEWARE_SPEC, ...titles);
const e2e = (...titles) => map('backendE2E', E2E, ...titles);
const BOTH = ['backendUnit', 'backendE2E'];
const UNIT = ['backendUnit'];
const DB = ['backendE2E'];

export const SUITES = {
  backendUnit: {
    args: ['run', MAPPER_SPEC, SERVICE_SPEC, CONTROLLER_SPEC, ACTOR_SPEC, DATABASE_SPEC, MIDDLEWARE_SPEC],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  // Mapper (AC1, AC5, AC6, AC11).
  {
    id: 'SPM157-BE-01',
    name: 'an approval of a submitted request reads as a rejection',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-01-A words submission, approval, rejection and other status changes"), ...e2e("AUDIT-HISTORY-01-B / 07-A records assignment, approval and reassignment through the API with their authors")],
    edits: [["status.to === 'Approved') return 'Event request approved'", "status.to === 'Approved') return 'Event request rejected'"]],
  },
  {
    id: 'SPM157-BE-02',
    name: 'a cancellation no longer reads as "Event cancelled"',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-01-A words submission, approval, rejection and other status changes")],
    edits: [["  Cancelled: 'Event cancelled',\n", '']],
  },
  {
    id: 'SPM157-BE-03',
    name: 'an earlier entry without an author is shown as made by the system instead of "Not recorded"',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-05-B / 11-A names the system and an unrecorded author", "AUDIT-HISTORY-11-A names an unrecorded decider of an earlier flagged change as Not recorded")],
    edits: [["if (kind === 'unrecorded') return { kind, name: UNRECORDED_ACTOR_NAME };", "if (kind === 'unrecorded') return { kind: 'system', name: SYSTEM_ACTOR_NAME };"]],
  },
  {
    id: 'SPM157-BE-04',
    name: 'entries sorted newest first',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-06-A merges every source into sections, oldest first", "AUDIT-HISTORY-06-A keeps the read order for entries at the same instant"), ...e2e("AUDIT-HISTORY-01-B / 07-A records assignment, approval and reassignment through the API with their authors")],
    edits: [['Date.parse(a.occurredAt) - Date.parse(b.occurredAt)', 'Date.parse(b.occurredAt) - Date.parse(a.occurredAt)']],
  },
  {
    id: 'SPM157-BE-05',
    name: 'instants passed to the client as stored instead of ISO UTC',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-01-C maps applied information updates with instants in ISO UTC", "AUDIT-HISTORY-02-A places booking entries in the venue section with readable values", "AUDIT-HISTORY-05-A shows coded values as words and keeps unparseable values")],
    edits: [['return Number.isNaN(instant.getTime()) ? value : instant.toISOString();', 'return value;']],
  },
  {
    id: 'SPM157-BE-06',
    name: 'a change request closed by the cancellation is credited to a person instead of the system',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-01-D maps a change request and each outcome")],
    edits: [["row.outcome === 'Closed' ? actorOf('system', null)", "row.outcome === 'Closed' ? actorOf('user', row.decided_by)"]],
  },
  {
    id: 'SPM157-BE-07',
    name: 'the decision on a flagged change is dropped',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-01-C maps a flagged change to a proposal and a decision with old and new values", "AUDIT-HISTORY-01-C gives a pending flagged change one entry and an applied one a decision", "AUDIT-HISTORY-11-A names an unrecorded decider of an earlier flagged change as Not recorded")],
    edits: [["if (row.status !== 'Needs Review' && row.resolved_at) {", 'if (false) {']],
  },
  {
    id: 'SPM157-BE-08',
    name: 'a declined cancellation request reads as accepted',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-01-E maps a cancellation request and its decision"), ...e2e("AUDIT-HISTORY-01-C / 01-D / 01-E reads flagged changes, change requests and cancellation requests in order")],
    edits: [["row.status === 'accepted' ? 'cancellation_accepted' : 'cancellation_declined'", "'cancellation_accepted'"]],
  },
  {
    id: 'SPM157-BE-09',
    name: 'an expired hold is credited to a person instead of the system',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-02-D maps an expired hold to a system entry at its expiry time"), ...e2e("AUDIT-HISTORY-02-D shows a hold as expired by the system exactly from its expiry time")],
    edits: [["actorOf('system', null), row.hold_expires_at, { subject: row.venue_name }", "actorOf('user', row.venue_name), row.hold_expires_at, { subject: row.venue_name }"]],
  },
  {
    id: 'SPM157-BE-10',
    name: 'a blank reason is kept instead of left out',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-05-A maps an audit row to an entry with old and new values, author, time and reason", "AUDIT-HISTORY-05-A leaves out a blank reason and an empty subject")],
    edits: [['return trimmed ? trimmed : undefined;', 'return value ?? undefined;']],
  },
  {
    id: 'SPM157-BE-11',
    name: 'the registrations section is filled with event entries',
    file: MAPPER,
    suites: BOTH,
    testMappings: [...mapper("AUDIT-HISTORY-06-A merges every source into sections, oldest first"), ...e2e("AUDIT-HISTORY-04-A / 04-B / 04-C / 08-A records registrations and waiting list changes", "AUDIT-HISTORY-04-A records leaving the waiting list and registering again on the same row")],
    edits: [["registrations: sorted.filter((item) => item.section === 'registrations')", "registrations: sorted.filter((item) => item.section === 'event')"]],
  },
  // Service (AC7, AC8, AC9).
  {
    id: 'SPM157-BE-12',
    name: 'the organiser is read the venue and equipment sources too',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service("AUDIT-HISTORY-08-A gives the owning organiser the event and registration sections only")],
    edits: [["viewer === 'coordinator' ? COORDINATOR_SECTIONS : ORGANISER_SECTIONS", 'COORDINATOR_SECTIONS']],
  },
  {
    id: 'SPM157-BE-13',
    name: 'the organiser is sent all four sections',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service("AUDIT-HISTORY-08-A gives the owning organiser the event and registration sections only"), ...e2e("AUDIT-HISTORY-04-A / 04-B / 04-C / 08-A records registrations and waiting list changes")],
    edits: [[': { event: sections.event, registrations: sections.registrations },', ': sections,']],
  },
  {
    id: 'SPM157-BE-14',
    name: 'any coordinator, not only the one assigned now, reads the history',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service("AUDIT-HISTORY-08-A prefers the coordinator view for a user holding both roles on the event"), ...e2e("AUDIT-HISTORY-01-B / 07-A records assignment, approval and reassignment through the API with their authors", "AUDIT-HISTORY-09-A / 09-B refuses everyone but the assigned coordinator and the owner")],
    edits: [["identity.roles.includes('COORDINATOR') && event.coordinator_id === identity.uid", "identity.roles.includes('COORDINATOR')"]],
  },
  {
    id: 'SPM157-BE-15',
    name: 'any organiser, not only the owner, reads the history',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...e2e("AUDIT-HISTORY-09-A / 09-B refuses everyone but the assigned coordinator and the owner")],
    edits: [["identity.roles.includes('ORGANISER') && event.organiser_id === identity.uid", "identity.roles.includes('ORGANISER')"]],
  },
  {
    id: 'SPM157-BE-16',
    name: 'a malformed event id is sent to the database instead of answering 404',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service("AUDIT-HISTORY-09-B answers 404 for an unknown or malformed event and 401 without a session"), ...e2e("AUDIT-HISTORY-09-A / 09-B refuses everyone but the assigned coordinator and the owner")],
    edits: [['    if (!UUID_PATTERN.test(eventId)) throw new NotFoundException(HISTORY_MESSAGES.notFound);\n', '']],
  },
  {
    id: 'SPM157-BE-17',
    name: 'hold expiry decided with the wall clock instead of the injected clock',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service("AUDIT-HISTORY-01-A gives the assigned coordinator all four sections, read with the injected clock", "AUDIT-HISTORY-08-A gives the owning organiser the event and registration sections only"), ...e2e("AUDIT-HISTORY-02-D shows a hold as expired by the system exactly from its expiry time")],
    edits: [['this.clock.now(),', 'new Date(),']],
  },
  {
    id: 'SPM157-BE-18',
    name: 'the session check is dropped',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service("AUDIT-HISTORY-09-B answers 404 for an unknown or malformed event and 401 without a session")],
    edits: [['    if (!identity) throw new UnauthorizedException(HISTORY_MESSAGES.signIn);\n', '']],
  },
  // Controller (AC10).
  {
    id: 'SPM157-BE-19',
    name: 'a change to the history answers 404 instead of 405',
    file: CONTROLLER,
    suites: BOTH,
    testMappings: [...e2e("AUDIT-HISTORY-10-A / 10-B keeps entries unchangeable")],
    edits: [['response.status(405)', 'response.status(404)']],
  },
  {
    id: 'SPM157-BE-20',
    name: 'the Allow: GET header is dropped from the 405',
    file: CONTROLLER,
    suites: BOTH,
    testMappings: [...e2e("AUDIT-HISTORY-10-A / 10-B keeps entries unchangeable")],
    edits: [[".set('Allow', 'GET')", '']],
  },
  // The acting user (AC5).
  {
    id: 'SPM157-BE-21',
    name: 'the actor setting outlives the transaction (not transaction-local)',
    file: DATABASE,
    suites: BOTH,
    testMappings: [...database("AUDIT-HISTORY-05-C sets the transaction-local actor after BEGIN")],
    edits: [["\"SELECT set_config('app.actor_id', $1, true)\"", "\"SELECT set_config('app.actor_id', $1, false)\""]],
  },
  {
    id: 'SPM157-BE-22',
    name: 'a single write for a signed-in user is not wrapped, so its author is lost',
    file: DATABASE,
    suites: BOTH,
    testMappings: [...database('AUDIT-HISTORY-05-C wraps the write "%s"')],
    edits: [['if (currentActorId() !== undefined && WRITE_STATEMENT.test(text)) {', 'if (false) {']],
  },
  {
    id: 'SPM157-BE-23',
    name: 'the request is not run as the signed-in user',
    file: MIDDLEWARE,
    suites: BOTH,
    testMappings: [...middleware("AUDIT-HISTORY-05-C runs the rest of the request as the signed-in user"), ...e2e("AUDIT-HISTORY-01-B / 07-A records assignment, approval and reassignment through the API with their authors", "AUDIT-HISTORY-01-A records a rejection with its reason")],
    edits: [['runAsActor(user.uid, () => next());', 'next();']],
  },
  {
    id: 'SPM157-BE-24',
    name: 'the actor context never returns the user',
    file: ACTOR,
    suites: BOTH,
    testMappings: [...actor("AUDIT-HISTORY-05-C keeps the actor across awaits and clears it afterwards", "AUDIT-HISTORY-05-C isolates concurrent requests"), ...database("AUDIT-HISTORY-05-C sets the transaction-local actor after BEGIN")],
    edits: [['return storage.getStore()?.actorId;', 'return undefined;']],
  },
  // event_audit_log triggers (migration 034), run through the e2e suite.
  {
    id: 'SPM157-DB-01',
    name: 'entries can be updated or deleted (append-only guard removed)',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-10-A / 10-B keeps entries unchangeable")],
    edits: [["RAISE EXCEPTION 'event_audit_log is append-only' USING ERRCODE = 'check_violation';", 'RETURN COALESCE(NEW, OLD);']],
  },
  {
    id: 'SPM157-DB-02',
    name: "the session user is ignored, so every person's change is recorded as the system",
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-01-B / 07-A records assignment, approval and reassignment through the API with their authors", "AUDIT-HISTORY-01-A records a rejection with its reason", "AUDIT-HISTORY-01-F records the safety check request, outcome and reset")],
    edits: [["v_actor := COALESCE(p_actor, nullif(current_setting('app.actor_id', true), ''));", 'v_actor := p_actor;']],
  },
  {
    id: 'SPM157-DB-03',
    name: 'a forced system entry names the session user instead',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-01-F records the safety check request, outcome and reset", "AUDIT-HISTORY-02-A / 02-B / 02-C records the venue booking and tentative hold lifecycle", "AUDIT-HISTORY-04-A / 04-B / 04-C / 08-A records registrations and waiting list changes")],
    edits: [['  IF NOT p_system THEN\n    v_actor', '  IF true THEN\n    v_actor']],
  },
  {
    id: 'SPM157-DB-04',
    name: 'the rejection reason is not stored',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-01-A records a rejection with its reason")],
    edits: [["CASE WHEN NEW.status = 'Rejected' THEN NEW.rejection_reason END", 'NULL']],
  },
  {
    id: 'SPM157-DB-05',
    name: 'a reassignment is recorded as a first assignment',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-01-B / 07-A records assignment, approval and reassignment through the API with their authors")],
    edits: [["           ELSE 'coordinator_reassigned' END,", "           ELSE 'coordinator_assigned' END,"]],
  },
  {
    id: 'SPM157-DB-06',
    name: 'registration settings changes are not recorded',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-04-D records registration settings changes with old and new values")],
    edits: [["  IF jsonb_array_length(v_changes) > 0 THEN\n    PERFORM record_event_audit(NEW.id, 'registration'", "  IF false THEN\n    PERFORM record_event_audit(NEW.id, 'registration'"]],
  },
  {
    id: 'SPM157-DB-07',
    name: 'a booking rejection loses its reason',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-02-A / 02-B / 02-C records the venue booking and tentative hold lifecycle")],
    edits: [["CASE WHEN NEW.status = 'rejected' THEN NEW.rejection_reason END, v_system);", 'NULL, v_system);']],
  },
  {
    id: 'SPM157-DB-08',
    name: 'a change made by another trigger on a booking is credited to the session user',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-02-A / 02-B / 02-C records the venue booking and tentative hold lifecycle")],
    edits: [['  v_changes jsonb;\n  v_system boolean := pg_trigger_depth() > 1;', '  v_changes jsonb;\n  v_system boolean := false;']],
  },
  {
    id: 'SPM157-DB-09',
    name: 'a booking returned to pending reads as a status change instead of returned for review',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-02-A / 02-B / 02-C records the venue booking and tentative hold lifecycle")],
    edits: [["      WHEN 'pending' THEN CASE WHEN v_hold THEN 'hold_returned_for_review' ELSE 'booking_returned_for_review' END\n", '']],
  },
  {
    id: 'SPM157-DB-10',
    name: 'Cannot Provide loses its reason',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-03-A / 03-B / 03-C records the equipment request lifecycle")],
    edits: [["CASE WHEN NEW.status = 'Cannot Provide' THEN NEW.decision_reason END", 'NULL']],
  },
  {
    id: 'SPM157-DB-11',
    name: 'an edit of the requested items is not recorded',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-03-D records an edit of the requested items")],
    edits: [['  IF v_previous IS NOT NULL AND v_items IS DISTINCT FROM v_previous THEN', '  IF false THEN']],
  },
  {
    id: 'SPM157-DB-12',
    name: 'a released equipment item is not recorded',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-03-A / 03-B / 03-C records the equipment request lifecycle")],
    edits: [["  IF NEW.status = 'Released' AND OLD.status IS DISTINCT FROM 'Released' THEN", '  IF false THEN']],
  },
  {
    id: 'SPM157-DB-13',
    name: 'a waiting list promotion is credited to a person instead of the system',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-04-A / 04-B / 04-C / 08-A records registrations and waiting list changes")],
    edits: [["  v_system := v_system OR v_action IN ('waitlist_promoted', 'waitlist_removed');\n", '']],
  },
  {
    id: 'SPM157-DB-14',
    name: 'a withdrawal is credited to the session user instead of the attendee',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-04-A records leaving the waiting list and registering again on the same row")],
    edits: [["  IF v_action IN ('registered', 'waitlist_joined', 'waitlist_left', 'registration_withdrawn') THEN", "  IF v_action IN ('registered', 'waitlist_joined') THEN"]],
  },
  {
    id: 'SPM157-DB-15',
    name: 'the registration cancellation reason is not stored',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-04-A / 04-B / 04-C / 08-A records registrations and waiting list changes")],
    edits: [["CASE WHEN NEW.status = 'Cancelled' THEN NEW.cancellation_reason END, v_system, v_actor);", 'NULL, v_system, v_actor);']],
  },
  {
    id: 'SPM157-DB-16',
    name: 'the Safety Officer feedback is not the reason of the outcome',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-01-F records the safety check request, outcome and reset")],
    edits: [['    v_reason := COALESCE(v_reason, NEW.feedback);\n', '    v_reason := NULL;\n']],
  },
  {
    id: 'SPM157-DB-17',
    name: 'a safety check reset is credited to the session user instead of the system',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-01-F records the safety check request, outcome and reset")],
    edits: [["    '[]'::jsonb, NEW.reason, true);", "    '[]'::jsonb, NEW.reason, false);"]],
  },
  {
    id: 'SPM157-DB-18',
    name: 'a clarification reply reads as a new clarification request',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-01-H records a clarification request, its reply and its resolution")],
    edits: [["CASE WHEN NEW.type = 'clarification' THEN 'clarification_requested' ELSE 'clarification_replied' END", "'clarification_requested'"]],
  },
  {
    id: 'SPM157-DB-19',
    name: 'a clarification resolution is not recorded',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-01-H records a clarification request, its reply and its resolution")],
    edits: [['  ELSIF NEW.resolved AND NOT OLD.resolved THEN', '  ELSIF false THEN']],
  },
  {
    id: 'SPM157-DB-20',
    name: 'reopening a safety feedback item is not recorded',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-01-I records the coordinator marking a safety feedback item resolved and reopening it")],
    edits: [['  ELSIF NEW.resolved_by_coordinator_at IS NULL AND OLD.resolved_by_coordinator_at IS NOT NULL THEN', '  ELSIF false THEN']],
  },
  {
    id: 'SPM157-DB-21',
    name: 'the completion record leaves out its issues',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-01-J records the completion record with its attendance, notes and issues")],
    edits: [["  IF v_issues IS DISTINCT FROM COALESCE(v_previous, '[]'::jsonb) THEN", '  IF false THEN']],
  },
  {
    id: 'SPM157-DB-22',
    name: 'a venue change affecting the booking loses the notice text',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-02-E records a venue change that affects the booking, with the notice text")],
    edits: [["NEW.related_booking_id, v_venue, '[]'::jsonb, NEW.message, pg_trigger_depth() > 1);", "NEW.related_booking_id, v_venue, '[]'::jsonb, NULL, pg_trigger_depth() > 1);"]],
  },
  {
    id: 'SPM157-DB-23',
    name: 'earlier records are loaded again each time the migration runs',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e("AUDIT-HISTORY-11-A loads earlier records once, naming an author only where one was recorded")],
    edits: [['  IF EXISTS (SELECT 1 FROM event_audit_log) THEN\n    RETURN;\n  END IF;\n', '']],
  },
  {
    id: 'SPM157-DB-24',
    name: 'the expiry processor marking a hold expired is recorded as a second, generic entry',
    file: MIGRATION,
    suites: DB,
    testMappings: [...e2e('AUDIT-HISTORY-02-D shows a hold as expired by the system exactly from its expiry time')],
    edits: [["  IF NEW.status = 'expired' AND OLD.status IS DISTINCT FROM 'expired' THEN\n    RETURN NULL;\n  END IF;\n", '']],
  },
  {
    id: 'SPM157-BE-25',
    name: 'a hold the expiry processor marked expired drops out of the history',
    file: 'src/events/history/event-history.repository.ts',
    suites: DB,
    testMappings: [...e2e('AUDIT-HISTORY-02-D shows a hold as expired by the system exactly from its expiry time')],
    edits: [["AND b.status IN ('approved', 'expired')", "AND b.status = 'approved'"]],
  },
];
