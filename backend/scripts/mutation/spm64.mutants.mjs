// SPM-64 backend mutants (Request a Change to a Submitted Event, Organiser), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm64.mutants.mjs            # every mutant (e2e needs DATABASE_URL)
//   node scripts/mutation/run.mjs --mutants spm64.mutants.mjs --only C3
// Written under SPM-175 (4 Nov 2026). Each edit is [from, to]; `from` must occur exactly once in the file
// (run.mjs reports MISAPPLIED otherwise). The runner mutates a scratch copy, never the repository tree.
// No mutant is claimed equivalent. The frontend mutants are in frontend/scripts/testing/mutation/spm64.mutants.mjs.
export const SUITES = {
  // The change request module, the Lead's assign/reassign notice path and the Singapore time helper.
  unit: {
    args: ['run', 'src/events/change-requests', 'src/lead/lead-assignment.service.spec.ts', 'src/common/sgt-time.spec.ts'],
  },
  // Real PostgreSQL: every REQ-CHANGE case over HTTP, including the one-pending unique index.
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/change-requests.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const SERVICE = 'src/events/change-requests/change-requests.service.ts';
const INPUT = 'src/events/change-requests/dto/change-request-input.ts';
const NOTICE = 'src/events/change-requests/change-request-notice.ts';
const SGT = 'src/common/sgt-time.ts';
const CTRL = 'src/events/change-requests/change-requests.controller.ts';
const both = ['unit', 'e2e'];

export const MUTANTS = [
  // AC1: exactly the permitted change types; only fields that differ are kept; a request needs a change.
  { id: 'C1', name: 'description is no longer a permitted change type (01-A)', file: INPUT,
    edits: [["export const PERMITTED_CHANGE_FIELDS = [\n  'description',\n", 'export const PERMITTED_CHANGE_FIELDS = [\n']],
    suites: both },
  { id: 'C2', name: 'unchanged fields are kept in the request (01-B, 01-E)', file: SERVICE,
    edits: [['            input.changes[field] !== undefined &&\n            !sameValue(field, storedValue(event, field), input.changes[field]),', '            input.changes[field] !== undefined,']],
    suites: both },
  { id: 'C3', name: 'a request with no real change is accepted (01-E)', file: SERVICE,
    edits: [['        if (!changes.length)', '        if (false)']],
    suites: both },
  { id: 'C4', name: 'a schedule whose end equals its start is accepted (01-C boundary)', file: SERVICE,
    edits: [['        if (end <= start)', '        if (end < start)']],
    suites: ['unit'] },
  { id: 'C5', name: 'the optional reason limit rises above 500 characters (01-SUP-REASON boundary)', file: INPUT,
    edits: [['export const REASON_MAX = 500;', 'export const REASON_MAX = 501;']],
    suites: ['unit'] },
  // AC2, AC6: the event name and organiser are locked; non-permitted fields are named in the error.
  { id: 'C6', name: 'the event name is no longer locked (02-B)', file: INPUT,
    edits: [["  name: 'Event name cannot be changed.',\n", '']],
    suites: both },
  { id: 'C7', name: 'the organiser id is no longer locked (02-C)', file: INPUT,
    edits: [["  organiserId: 'Event organiser cannot be changed.',\n", '']],
    suites: ['unit'] },
  { id: 'C8', name: 'a non-permitted field is silently accepted (02-D, 06-B)', file: INPUT,
    edits: [['    } else if (!isPermitted(key)) errors[key] = NOT_PERMITTED;', '    }']],
    suites: both },
  { id: 'C9', name: 'unknown top-level keys are accepted (08-B)', file: INPUT,
    edits: [["    if (key !== 'changes' && key !== 'reason') errors[key] = 'Unknown field.';", "    if (false) errors[key] = 'Unknown field.';"]],
    suites: both },
  { id: 'C10', name: 'locked-field check reads the prototype chain (08-D)', file: INPUT,
    edits: [['    if (Object.hasOwn(LOCKED_FIELDS, key)) {', '    if (key in LOCKED_FIELDS) {']],
    suites: both },
  // AC7: Submitted to Confirmed events that have not started.
  { id: 'C11', name: 'a Confirmed event no longer takes a change request (01-F)', file: SERVICE,
    edits: [["export const CHANGE_REQUEST_OPEN_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed'] as const;", "export const CHANGE_REQUEST_OPEN_STATUSES = ['Submitted', 'Approved', 'Planning'] as const;"]],
    suites: both },
  { id: 'C12', name: 'a Rejected, Cancelled or Completed event takes a change request (01-F)', file: SERVICE,
    edits: [['        if (!(CHANGE_REQUEST_OPEN_STATUSES as readonly string[]).includes(event.status))', '        if (false)']],
    suites: both },
  { id: 'C13', name: 'a request is accepted at the event start instant (01-F boundary)', file: SERVICE,
    edits: [['        if (this.clock.now().getTime() >= new Date(event.start_date_time).getTime())', '        if (this.clock.now().getTime() > new Date(event.start_date_time).getTime())']],
    suites: ['unit'] },
  // AC8: one pending request per event; the owner may withdraw a pending one.
  { id: 'C14', name: 'a second pending request is accepted (01-H)', file: SERVICE,
    edits: [['        if (pending.rows.length)', '        if (false)']],
    suites: ['unit'] },
  { id: 'C15', name: 'the unique-index race is not mapped to the pending conflict (01-H concurrency)', file: SERVICE,
    edits: [["      if ((error as { code?: string }).code === '23505')", '      if (false)']],
    suites: both },
  { id: 'C16', name: 'a decided request can be withdrawn (09-B)', file: SERVICE,
    edits: [["      if (request.status !== 'Pending') throw new ConflictException(MESSAGES.decided);", '']],
    suites: both },
  { id: 'C17', name: 'another organiser can withdraw the request (09-A)', file: SERVICE,
    edits: [['      if (!event || event.organiser_id !== user.uid) throw new NotFoundException(MESSAGES.notFound);\n      const found = await client.query(', '      if (!event) throw new NotFoundException(MESSAGES.notFound);\n      const found = await client.query(']],
    suites: both },
  // AC3: the assigned coordinator is notified; a newly assigned coordinator gets the pending request's notice.
  { id: 'C18', name: 'the assigned coordinator is not notified (03-A)', file: SERVICE,
    edits: [['        if (event.coordinator_id)\n          await insertChangeRequestNotice(', '        if (false)\n          await insertChangeRequestNotice(']],
    suites: both },
  { id: 'C19', name: 'a newly assigned coordinator is not told about the pending request (03-C, 03-D)', file: NOTICE,
    edits: [['  if (!request) return false;\n  await insertChangeRequestNotice(', '  if (request || !request) return false;\n  await insertChangeRequestNotice(']],
    suites: both },
  // AC5, AC3: only the owner and the assigned coordinator read an event's requests.
  { id: 'C20', name: 'any coordinator reads an event’s requests (03-B, 05-C)', file: SERVICE,
    edits: [["      (user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid)", "      user.roles.includes('COORDINATOR')"]],
    suites: both },
  { id: 'C21', name: 'any organiser reads an event’s requests (05-C)', file: SERVICE,
    edits: [["      (user.roles.includes('ORGANISER') && event.organiser_id === user.uid) ||", "      user.roles.includes('ORGANISER') ||"]],
    suites: both },
  { id: 'C22', name: 'an unknown status filter is accepted (08-SUP-SERVICE)', file: SERVICE,
    edits: [['    if (status !== undefined && !(CHANGE_REQUEST_STATUSES as readonly unknown[]).includes(status))', '    if (false)']],
    suites: ['unit'] },
  // Cross-cutting: only the owning organiser submits.
  { id: 'C23', name: 'a non-organiser can submit a change request (08-A)', file: SERVICE,
    edits: [["    if (!user.roles.includes('ORGANISER'))\n      throw new ForbiddenException('Only the event organiser can request a change.');", '']],
    suites: both },
  // REQ-CHANGE-01-SUP-SGT: server-built text uses Singapore time.
  { id: 'C24', name: 'server-built times are not shifted to Singapore time (01-SUP-SGT)', file: SGT,
    edits: [['  return new Date(value + SGT_OFFSET_MS);', '  return new Date(value);']],
    suites: ['unit'] },
  { id: 'C25', name: 'noon shown as am (01-SUP-SGT boundary)', file: SGT,
    edits: [["hours < 12 ? 'am' : 'pm'", "hours <= 12 ? 'am' : 'pm'"]],
    suites: ['unit'] },
  // Added under SPM-175 so every SPM-64 test kills at least one measured mutant (G3).
  { id: 'C26', name: 'the coordinator notice does not name the requested fields (03-A)', file: NOTICE,
    edits: [['    .map((change) => FIELD_NAMES[change.field])', "    .map(() => 'details')"]], suites: both },
  { id: 'C27', name: 'the notice is stored with the wrong type (03-A)', file: NOTICE,
    edits: [["VALUES ($1, $2, '${CHANGE_REQUEST_NOTICE}', $3, $4)", "VALUES ($1, $2, 'approval', $3, $4)"]], suites: both },
  { id: 'C28', name: 'an assignment with no pending request reports a notice sent (03-C)', file: NOTICE,
    edits: [['  if (!request) return false;\n  await insertChangeRequestNotice(', '  if (!request) return true;\n  await insertChangeRequestNotice(']], suites: ['unit'] },
  { id: 'C29', name: 'the create route drops the request body (controller delegation)', file: CTRL,
    edits: [['return this.changeRequests.create(request[CURRENT_USER_REQUEST_KEY], id, body);', 'return this.changeRequests.create(request[CURRENT_USER_REQUEST_KEY], id, {});']], suites: both },
  { id: 'C30', name: 'the withdraw route swaps the event and request ids (controller delegation)', file: CTRL,
    edits: [['return this.changeRequests.withdraw(request[CURRENT_USER_REQUEST_KEY], id, requestId);', 'return this.changeRequests.withdraw(request[CURRENT_USER_REQUEST_KEY], requestId, id);']], suites: both },
  { id: 'C31', name: 'the dashboard route drops the status filter (controller delegation)', file: CTRL,
    edits: [['return this.changeRequests.listMine(request[CURRENT_USER_REQUEST_KEY], status);', 'return this.changeRequests.listMine(request[CURRENT_USER_REQUEST_KEY], undefined);']], suites: both },
  { id: 'C32', name: 'submitting a request changes the event itself (01-G)', file: SERVICE,
    edits: [["        const safety = await client.query('SELECT 1 FROM event_safety_checks WHERE event_id = $1', [eventId]);", "        await client.query('UPDATE events SET updated_at = now() WHERE id = $1', [eventId]);\n        const safety = await client.query('SELECT 1 FROM event_safety_checks WHERE event_id = $1', [eventId]);"]], suites: both },
  { id: 'C33', name: 'a malformed event id reaches the database (08-C)', file: SERVICE,
    edits: [['    if (!UUID.test(eventId)) throw new NotFoundException(MESSAGES.notFound);', '    if (false) throw new NotFoundException(MESSAGES.notFound);']], suites: ['unit'] },
  { id: 'C34', name: 'an event’s requests are never listed (05-A)', file: SERVICE,
    edits: [['    return result.rows.map((row) => this.toRecord(row, event.event_name, event.organiser_name));', '    return [];']], suites: both },
  { id: 'C35', name: 'a decided request loses its decider and reason (05-B)', file: SERVICE,
    edits: [['      ...(row.decided_by ? { decidedBy: row.decided_by } : {}),\n      ...(row.decision_reason ? { decisionReason: row.decision_reason } : {}),', '']], suites: both },
  { id: 'C36', name: 'a pending request uses the stored safety flag instead of the live one (07-A)', file: SERVICE,
    edits: [["        row.status === 'Pending' && typeof row.has_safety_check === 'boolean'", '        false']], suites: both },
  { id: 'C37', name: 'the dashboard list swaps the organiser and coordinator scopes (05-A)', file: SERVICE,
    edits: [["        user.roles.includes('ORGANISER'),\n        user.roles.includes('COORDINATOR'),", "        user.roles.includes('COORDINATOR'),\n        user.roles.includes('ORGANISER'),"]], suites: both },
  { id: 'C38', name: 'the dashboard list ignores the status filter (05-A)', file: SERVICE,
    edits: [['        status ?? null,', '        null,']], suites: both },
  { id: 'C39', name: 'a withdrawn request stays Pending (09-C)', file: SERVICE,
    edits: [["SET status = 'Withdrawn', decided_by = $2", "SET status = 'Pending', decided_by = $2"]], suites: both },
  { id: 'C40', name: 'proposed values are stored uncleaned (01-B)', file: INPUT,
    edits: [["    changes: values.cleaned as ChangeRequestInput['changes'],", "    changes: permitted as ChangeRequestInput['changes'],"]], suites: both },
  { id: 'C41', name: 'invalid proposed values are not reported (01-C, 01-D)', file: INPUT,
    edits: [['    return { errors: body.errors };', '    return { errors: {} };']], suites: both },
  { id: 'C42', name: 'a request with an empty changes object is accepted (01-E)', file: INPUT,
    edits: [['  if (!keys.length)\n    throw new BadRequestException({', '  if (false)\n    throw new BadRequestException({']], suites: both },
];
