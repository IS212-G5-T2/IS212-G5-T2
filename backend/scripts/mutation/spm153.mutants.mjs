// SPM-153 backend mutants (Confirmed to Completed: the transition, the end-instant rule, the completion record, the
// arrangements guard on planning, venue and change-request mutations). Run by run.mjs:
// `node scripts/mutation/run.mjs --mutants spm153.mutants.mjs`.
// Each edit is [from, to]; `from` must occur exactly once in its file (the runner reports MISAPPLIED otherwise).
// Each mutant names the tests that must go red. Mutant ids M1 to M26 follow the SPM-153 assignment; gaps in the
// numbering are mutants this file does not express (M3, M5, M6, M8 to M12, M17, M18, M22 to M25), listed in
// docs/test-cases/workflow/gap-list notes of the cycle; they are not claimed as killed.
// Suites: `unit` needs no database. `e2e` needs DATABASE_URL (a database built from database/postgresql/init 001 to 029).
export const SUITES = {
  unit: { args: ['run', 'src/events/completion', 'src/events/change-requests/change-requests.service.spec.ts', 'src/events/change-requests/review/change-request-review.service.spec.ts'] },
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-completion.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const STATUS = 'src/events/status/status.service.ts';
const RULES = 'src/events/completion/completion.rules.ts';
const RECORD = 'src/events/completion/completion-record.service.ts';
const RULES_FILE = 'src/events/completion/completion.rules.ts';
const GUARD = 'src/events/cancelled-guard.ts';
const CHANGE_REQUESTS = 'src/events/change-requests/change-requests.service.ts';
const recordSpec = 'src/events/completion/completion-record.service.spec.ts';

const changeReqSpec = 'src/events/change-requests/change-requests.service.spec.ts';
const PLANNING = 'src/events/planning/event-planning.service.ts';
const VENUES = 'src/venues/repository/venues.repository.ts';
const REVIEW = 'src/events/change-requests/review/change-request-review.service.ts';

const unit = (file, title) => ({ suite: 'unit', file, title });
const e2e = (title) => ({ suite: 'e2e', file: 'test/events-completion.e2e-spec.ts', title });
const rulesSpec = 'src/events/completion/completion.rules.spec.ts';
const guardSpec = 'src/events/completion/arrangements-guard.spec.ts';
const reviewSpec = 'src/events/change-requests/review/change-request-review.service.spec.ts';

export const MUTANTS = [
  { id: 'M1', name: 'eligibility uses the event start instead of the end', file: STATUS,
    edits: [["'SELECT id, status, event_name, organiser_id, coordinator_id, end_date_time FROM events WHERE id = $1 FOR UPDATE'",
      "'SELECT id, status, event_name, organiser_id, coordinator_id, start_date_time AS end_date_time FROM events WHERE id = $1 FOR UPDATE'"]],
    suites: ['e2e'], testMappings: [e2e('COMPLETE-EVENT-01-E: an event that has started but not ended is refused with 422 and stays Confirmed')] },
  { id: 'M2', name: 'the end instant is exclusive (> instead of >=)', file: RULES,
    edits: [['return now.getTime() >= endDateTime.getTime();', 'return now.getTime() > endDateTime.getTime();']],
    suites: ['unit', 'e2e'], testMappings: [unit(rulesSpec, 'COMPLETE-EVENT-01-C: at %s the result is %s'), e2e('COMPLETE-EVENT-01-C: at %s the response is %i')] },
  { id: 'M4', name: 'the status check is removed, so a non-Confirmed event can be completed when it has ended', file: STATUS,
    edits: [["if (current.status !== 'Confirmed')", 'if (false)']],
    suites: ['e2e'], testMappings: [e2e('COMPLETE-EVENT-02-C: a Planning event that has not ended gets 409 EVENT_NOT_COMPLETABLE, not 422')] },
  { id: 'M7', name: 'the history row is not written on completion', file: STATUS,
    edits: [["`INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at)\n       VALUES ($1, $2, 'Confirmed', 'Completed', $3, $4)`,",
      "`SELECT 1 WHERE $1 IS NOT NULL AND $2 IS NOT NULL AND $3 IS NOT NULL AND $4 IS NOT NULL`,"]],
    suites: ['e2e'], testMappings: [e2e('COMPLETE-EVENT-03-A: the status history reports Confirmed to Completed by the coordinator at the marking time')] },
  { id: 'M13', name: 'saving the completion record writes a status history row', file: RECORD,
    edits: [['await this.write(client, eventId, user.uid, now, result.value);',
      "await this.write(client, eventId, user.uid, now, result.value);\n      await client.query(\"INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at) VALUES (gen_random_uuid(), $1, 'Completed', 'Completed', $2, $3)\", [eventId, user.uid, now]);"]],
    suites: ['e2e'], testMappings: [e2e('COMPLETE-EVENT-05-A: the assigned coordinator saves the completion record on a Completed event')] },
  { id: 'M14', name: 'a partial save clears the notes that were not sent', file: RECORD,
    edits: [["'operationalNotes' in input ? input.operationalNotes ?? null : saved?.operational_notes ?? null", 'input.operationalNotes ?? null']],
    suites: ['e2e'], testMappings: [e2e('COMPLETE-EVENT-05-B: saving only attendance keeps the saved notes and issues')] },
  { id: 'M15', name: 'the record is accepted on a non-Completed event', file: RECORD,
    edits: [["if (locked.status !== 'Completed')", 'if (false)']],
    suites: ['e2e'], testMappings: [e2e('COMPLETE-EVENT-05-C: a %s event refuses the record with 409 and stores nothing')] },
  { id: 'M16', name: 'the notes limit is off by one (2001 characters accepted)', file: RULES,
    edits: [['export const MAX_NOTES_LENGTH = 2000;', 'export const MAX_NOTES_LENGTH = 2001;']],
    suites: ['unit'], testMappings: [unit(rulesSpec, 'COMPLETE-EVENT-05-E: notes of %s characters are accepted: %s')] },
  { id: 'M19', name: 'the planning update is not guarded, so a Completed event can be changed', file: PLANNING,
    edits: [['assertArrangementsEditable(access.event.status);', '// removed']],
    suites: ['e2e'], testMappings: [e2e('COMPLETE-EVENT-06-B: the assigned coordinator cannot move a Completed event by its planning update')] },
  { id: 'M20', name: 'venue approval of a Completed event is not refused', file: VENUES,
    edits: [["if (booking.event_status === 'Completed') return { kind: 'event-completed' as const };", '// removed']],
    suites: ['e2e'], testMappings: [e2e('COMPLETE-EVENT-06-C: venue staff cannot approve a pending booking of a Completed event')] },
  { id: 'M20b', name: 'venue reject and coordinator cancel of a Completed event are not refused', file: VENUES,
    edits: [["if (locked.booking.event_status === 'Completed') return { kind: 'event-completed' as const };", '// removed'],
      ["if (row.event_status === 'Completed') return { kind: 'event-completed' as const };", '// removed']],
    suites: ['e2e'], testMappings: [e2e('COMPLETE-EVENT-06-C: venue staff cannot reject a pending booking, and the coordinator cannot cancel an approved one, of a Completed event')] },
  { id: 'M21', name: 'a pending change request of a Completed event can be applied', file: REVIEW,
    edits: [["      if (request.status !== 'Approved')\n        throw new ConflictException(REVIEW_MESSAGES.notApproved);\n      assertArrangementsEditable(event.status);",
      "      if (request.status !== 'Approved')\n        throw new ConflictException(REVIEW_MESSAGES.notApproved);"]],
    suites: ['unit'], testMappings: [unit(reviewSpec, 'COMPLETE-EVENT-06-E refuses to apply a change to a Completed event with 409 EVENT_COMPLETED')] },
  { id: 'M26', name: 'an upper limit on late completion (refused after 60 days)', file: STATUS,
    edits: [['if (!hasEventEnded(current.end_date_time, now))', 'if (!hasEventEnded(current.end_date_time, now) || now.getTime() - current.end_date_time.getTime() > 60 * 86400000)']],
    suites: ['e2e'], testMappings: [e2e('COMPLETE-EVENT-01-F: an event that ended 90 days ago can be completed, and the history shows the marking time')] },
  { id: 'M3', name: 'the save does not re-check the assigned coordinator on the locked row (a reassignment after the pre-check is accepted)', file: RECORD,
    edits: [['if (locked.coordinator_id !== user.uid)', 'if (false)']],
    suites: ['unit'], testMappings: [unit(recordSpec, 'COMPLETE-EVENT-05-F: a save whose locked row names another coordinator is refused with 403 and writes nothing')] },
  { id: 'M16b', name: 'the attendance limit is off by one (2147483648 accepted)', file: RULES_FILE,
    edits: [['export const MAX_ATTENDANCE = 2147483647;', 'export const MAX_ATTENDANCE = 2147483648;']],
    suites: ['unit'], testMappings: [unit(rulesSpec, 'COMPLETE-EVENT-05-E: attendance %j is accepted: %s')] },
  { id: 'M16c', name: 'the issue limit is off by one (51 issues accepted)', file: RULES_FILE,
    edits: [['export const MAX_ISSUES = 50;', 'export const MAX_ISSUES = 51;']],
    suites: ['unit'], testMappings: [unit(rulesSpec, 'COMPLETE-EVENT-05-E: an issue list is accepted: %s')] },
  { id: 'M27', name: 'the arrangements guard no longer refuses a Completed event', file: GUARD,
    edits: [["if (status === 'Completed')", "if (status === 'NeverCompleted')"]],
    suites: ['unit'], testMappings: [unit(guardSpec, 'COMPLETE-EVENT-06-B: refuses a Completed event with 409 EVENT_COMPLETED and MSG-CP-06')] },
  { id: 'M28', name: 'a change request on a Completed event is not refused by the guard in the create path', file: CHANGE_REQUESTS,
    edits: [["if (event.status === 'Completed') assertArrangementsEditable(event.status);", '// removed']],
    suites: ['unit'], testMappings: [unit(changeReqSpec, 'COMPLETE-EVENT-06-E refuses a request on a Completed event with 409 EVENT_COMPLETED')] },
  { id: 'M29', name: 'an issue without a text description is not refused', file: RULES_FILE,
    edits: [["if (!isPlainObject(issue) || typeof issue.description !== 'string')", 'if (!isPlainObject(issue))']],
    suites: ['unit'], testMappings: [unit(rulesSpec, 'COMPLETE-EVENT-05-D: a value of the wrong type is refused and names its field: %j')] },
  { id: 'M30', name: 'an unknown key in the record body is accepted', file: RULES_FILE,
    edits: [['if (keys.length === 0 || keys.some((key) => !(RECORD_KEYS as readonly string[]).includes(key)))', 'if (keys.length === 0)']],
    suites: ['unit'], testMappings: [unit(rulesSpec, 'COMPLETE-EVENT-05-D: an empty body and an unknown key are refused as the body')] },
  { id: 'M31', name: 'a null attendance is refused instead of clearing the attendance', file: RULES_FILE,
    edits: [['if (attendance !== null && (typeof attendance', 'if ((typeof attendance']],
    suites: ['unit'], testMappings: [unit(rulesSpec, 'COMPLETE-EVENT-05-B: null clears attendance and notes')] },
  { id: 'M32', name: 'the arrangements guard no longer refuses a Cancelled event (MSG-CN-04 lost)', file: GUARD,
    edits: [['  assertEventNotCancelled(status);', '  // removed']],
    suites: ['unit'], testMappings: [unit(guardSpec, 'COMPLETE-EVENT-06-B: keeps the MSG-CN-04 refusal for a Cancelled event')] },
  { id: 'M33', name: 'the arrangements guard refuses a Confirmed event too', file: GUARD,
    edits: [["if (status === 'Completed')", "if (status === 'Completed' || status === 'Confirmed')"]],
    suites: ['unit'], testMappings: [unit(guardSpec, 'COMPLETE-EVENT-06-B: does not refuse a %s event')] },
  { id: 'M34', name: 'a record read without an identity is not refused', file: RECORD,
    edits: [["if (!identity?.uid) throw new UnauthorizedException('Authentication required.');", '']],
    suites: ['unit'], testMappings: [unit(recordSpec, 'COMPLETE-EVENT-05-F: a read without an identity is refused with 401')] },
  { id: 'M35', name: 'a save whose event row has disappeared is not refused with 404', file: RECORD,
    edits: [['if (!locked) throw new NotFoundException(STATUS_MESSAGES.notFound);', '']],
    suites: ['unit'], testMappings: [unit(recordSpec, 'COMPLETE-EVENT-05-F: a save whose event row has disappeared is refused with 404')] },
  { id: 'M36', name: 'empty notes are stored as empty text instead of clearing the notes', file: RULES_FILE,
    edits: [["value.operationalNotes = trimmed === '' ? null : trimmed;", 'value.operationalNotes = trimmed;']],
    suites: ['unit'], testMappings: [unit(rulesSpec, 'COMPLETE-EVENT-05-B: a subset is accepted, and empty notes and an empty list clear their item')] },
];
