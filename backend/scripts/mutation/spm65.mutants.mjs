// SPM-65 backend mutants (Review and Approve/Deny a Change Request, Coordinator), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm65.mutants.mjs            # every mutant (e2e needs DATABASE_URL)
//   node scripts/mutation/run.mjs --mutants spm65.mutants.mjs --only R3
// Written under SPM-175 (4 Nov 2026). Each edit is [from, to]; `from` must occur exactly once in the file
// (run.mjs reports MISAPPLIED otherwise). The runner mutates a scratch copy, never the repository tree.
// No mutant is claimed equivalent. The frontend mutants are in frontend/scripts/testing/mutation/spm65.mutants.mjs.
export const SUITES = {
  // The change request module (review service, assessment, audit, releaser, controller) and the organiser's feed types.
  unit: {
    args: ['run', 'src/events/change-requests'],
  },
  // Real PostgreSQL: every REVIEW-CHANGE case over HTTP, with real approve, deny, re-check, withdraw and cancel routes.
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/change-request-review.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const SERVICE = 'src/events/change-requests/review/change-request-review.service.ts';
const ASSESS = 'src/events/change-requests/review/assess-change-request.ts';
const AUDIT = 'src/events/change-requests/change-request-audit.ts';
const RELEASER = 'src/events/change-requests/release/change-request.releaser.ts';
const EVENTS = 'src/events/events.service.ts';
const CTRL = 'src/events/change-requests/change-requests.controller.ts';
const REQUESTS = 'src/events/change-requests/change-requests.service.ts';
const both = ['unit', 'e2e'];

export const MUTANTS = [
  // AC4: only a pending request on an open, not-started event without a competing flagged change is approved.
  { id: 'R1', name: 'approve skips the pending check: a decided request is approved again (04-B)', file: SERVICE,
    edits: [['      this.requirePending(request);\n      assertArrangementsEditable(event.status);\n      if (!OPEN', '      assertArrangementsEditable(event.status);\n      if (!OPEN']],
    suites: both },
  { id: 'R2', name: 'approval allowed at the event start instant (04-SUP-STATE boundary)', file: SERVICE,
    edits: [['this.clock.now().getTime() >= Date.parse(event.startDateTime)', 'this.clock.now().getTime() > Date.parse(event.startDateTime)']],
    suites: ['unit'] },
  { id: 'R3', name: 'approval allowed on a status that no longer takes changes (04-SUP-STATE)', file: SERVICE,
    edits: [['if (!OPEN.includes(event.status))', 'if (false)']],
    suites: ['unit'] },
  { id: 'R4', name: 'approval ignores a flagged change awaiting review on the same detail (04-F)', file: SERVICE,
    edits: [['if (flagged.length)', 'if (false)']],
    suites: ['unit'] },
  { id: 'R5', name: 'approval skips revalidation: values no longer valid are applied (04-D)', file: SERVICE,
    edits: [['const valid = this.revalidate(patch, event);', 'const valid = patch;']],
    suites: both },
  // AC9: the arrangements the change affects go on the re-check list.
  { id: 'R6', name: 'approval stores an empty re-check list (09-A)', file: SERVICE,
    edits: [['        ...assessment.venueBookings,\n        ...assessment.equipment,\n', '']],
    suites: both },
  // AC8: an existing safety check is reset with the agreed reason; a Confirmed event returns to Planning.
  { id: 'R7', name: 'safety reset reason not recorded (08-A)', file: SERVICE,
    edits: [["if (safetyCheckReset)\n        await this.repository.query(\n          'UPDATE event_safety_resets", "if (false)\n        await this.repository.query(\n          'UPDATE event_safety_resets"]],
    suites: both },
  { id: 'R8', name: 'a Confirmed event keeps Confirmed after an approved change (08-D)', file: SERVICE,
    edits: [["if (event.status === 'Confirmed') {", 'if (false) {']],
    suites: both },
  { id: 'R9', name: 'the reset is never reported to the coordinator (08-A, 06-A)', file: SERVICE,
    edits: [['hadSafetyCheck && !(await this.repository.safetyCheckExists(eventId));', 'false && !(await this.repository.safetyCheckExists(eventId));']],
    suites: both },
  { id: 'R10', name: 'the reset is reported even when no safety check existed (08-F)', file: SERVICE,
    edits: [['hadSafetyCheck && !(await this.repository.safetyCheckExists(eventId));', 'true;']],
    suites: both },
  // AC7, AC5: the organiser is notified of the decision.
  { id: 'R11', name: 'an approval is notified as a denial (07-D, 04-A)', file: SERVICE,
    edits: [["        'change_request_approved',\n", "        'change_request_denied',\n"]],
    suites: both },
  { id: 'R12', name: 'the denial notice drops the reason (05-A)', file: SERVICE,
    edits: [['was denied: ${reason}`', 'was denied.`']],
    suites: both },
  // AC10: every outcome is audited in the same transaction.
  { id: 'R13', name: 'an approval is not audited (10-A)', file: SERVICE,
    edits: [["await recordOutcome(this.repository, request, 'Approved', {", "if (false) await recordOutcome(this.repository, request, 'Approved', {"]],
    suites: both },
  { id: 'R14', name: 'a denial is not audited (10-B)', file: SERVICE,
    edits: [["await recordOutcome(this.repository, request, 'Denied', {", "if (false) await recordOutcome(this.repository, request, 'Denied', {"]],
    suites: both },
  { id: 'R15', name: 'the audit entry drops the denial reason (10-B)', file: AUDIT,
    edits: [['      decision.decidedById,\n', '      decision.decidedById,\n      void 0,\n']],
    suites: both },
  // AC5: a denial needs a trimmed reason of 10 to 500 characters.
  { id: 'R16', name: 'the minimum denial reason drops to 9 characters (05-C boundary)', file: SERVICE,
    edits: [['export const DENIAL_REASON_MIN = 10;', 'export const DENIAL_REASON_MIN = 9;']],
    suites: ['unit'] },
  { id: 'R17', name: 'the maximum denial reason rises to 501 characters (05-C boundary)', file: SERVICE,
    edits: [['export const DENIAL_REASON_MAX = 500;', 'export const DENIAL_REASON_MAX = 501;']],
    suites: ['unit'] },
  { id: 'R18', name: 'a blank denial reason is accepted (05-B)', file: SERVICE,
    edits: [['    if (!reason)\n      throw new BadRequestException({\n        message: REVIEW_MESSAGES.reasonRequired,', '    if (false)\n      throw new BadRequestException({\n        message: REVIEW_MESSAGES.reasonRequired,']],
    suites: both },
  { id: 'R19', name: 'the denial reason is not trimmed (05-A)', file: SERVICE,
    edits: [["typeof data.reason === 'string' ? data.reason.trim() : ''", "typeof data.reason === 'string' ? data.reason : ''"]],
    suites: both },
  // AC9: re-checks apply only to approved requests and each item once.
  { id: 'R20', name: 'a re-check is accepted on a request that is not approved (09-D)', file: SERVICE,
    edits: [["if (request.status !== 'Approved')", 'if (false)']],
    suites: both },
  { id: 'R21', name: 'an arrangement can be re-checked twice (09-D)', file: SERVICE,
    edits: [['if (item.checkedAt)', 'if (false)']],
    suites: both },
  // Cross-cutting (AC1 scope): only the assigned coordinator reviews; inputs are strict.
  { id: 'R22', name: 'a non-coordinator may review (11-A)', file: SERVICE,
    edits: [["if (!identity.roles.includes('COORDINATOR'))", 'if (false)']],
    suites: both },
  { id: 'R23', name: 'any coordinator may review another coordinator’s event (11-A, 01-B)', file: SERVICE,
    edits: [['if (!event || event.coordinatorId !== user.uid)', 'if (!event)']],
    suites: both },
  { id: 'R24', name: 'an approval body is accepted (11-B)', file: SERVICE,
    edits: [['    if (body === undefined || body === null) return;', '    return;']],
    suites: both },
  { id: 'R25', name: 'the audit log is shown to anyone signed in (10-D)', file: SERVICE,
    edits: [['if (!canRead) throw', 'if (false) throw']],
    suites: both },
  // AC4, AC11: a request is decided once; the decision reads the request under a row lock.
  { id: 'R26', name: 'the request row is read without a lock (04-C, 12-A)', file: SERVICE,
    edits: [["${lock ? ' FOR UPDATE' : ''}", '']],
    suites: both },
  { id: 'R27', name: 'requirePending accepts any status (04-B, 12-A)', file: SERVICE,
    edits: [["if (request.status === 'Pending') return;", 'return;']],
    suites: both },
  // AC11: cancelling the event closes its pending requests.
  { id: 'R28', name: 'cancellation leaves pending requests open (12-B)', file: RELEASER,
    edits: [["SET status = 'Closed', decided_by = $2", "SET status = 'Pending', decided_by = $2"]],
    suites: both },
  // AC3: registrations are part of the conflict preview.
  { id: 'R29', name: 'attendance equal to the registered count is a conflict (03-G boundary)', file: ASSESS,
    edits: [['attendance < counts.registered', 'attendance <= counts.registered']],
    suites: both },
  { id: 'R30', name: 'a date change with registered attendees is not reported (03-G)', file: ASSESS,
    edits: [["(changed.includes('startDateTime') || changed.includes('endDateTime')) &&\n    total > 0", "(changed.includes('startDateTime') || changed.includes('endDateTime')) &&\n    total > 1"]],
    suites: both },
  { id: 'R31', name: 'registration conflicts do not count toward hasConflicts (03-B, 03-G)', file: ASSESS,
    edits: [['      equipmentList.length > 0 ||\n      details.length > 0,', '      equipmentList.length > 0,']],
    suites: both },
  // AC7: the organiser's feed carries the decision notices.
  { id: 'R32', name: 'the organiser feed leaves out change request approvals (07-D)', file: EVENTS,
    edits: [["            'change_request_approved',\n            'change_request_denied',\n", "            'change_request_denied',\n"]],
    suites: ['unit'] },
  // Added under SPM-175 so every SPM-65 test kills at least one measured mutant (G3).
  { id: 'R33', name: 'an empty audit reason is returned as a reason (10-B mapping)', file: AUDIT,
    edits: [['    ...(row.reason ? { reason: row.reason } : {}),\n    decidedAt', '    reason: row.reason,\n    decidedAt']], suites: both },
  { id: 'R34', name: 'the coordinator feed also gets the organiser’s decision notices (07-D)', file: EVENTS,
    edits: [['...COORDINATOR_NOTIFICATION_TYPES,', "...COORDINATOR_NOTIFICATION_TYPES, 'change_request_approved',"]], suites: ['unit'] },
  { id: 'R35', name: 'the approve route swaps the event and request ids (controller delegation)', file: CTRL,
    edits: [['return this.review.approve(\n      request[CURRENT_USER_REQUEST_KEY],\n      id,\n      requestId,', 'return this.review.approve(\n      request[CURRENT_USER_REQUEST_KEY],\n      requestId,\n      id,']], suites: both },
  { id: 'R36', name: 'the request record drops its re-check list (01-A mapping, 09-A)', file: REQUESTS,
    edits: [['      recheck: row.recheck ?? [],', '      recheck: [],']], suites: both },
  { id: 'R37', name: 'cancelling closes a request even when none is pending (12-B releaser)', file: RELEASER,
    edits: [['    for (const request of pending.rows) {', '    for (const request of pending.rows.length ? pending.rows : [{ id: null }]) {']], suites: ['unit'] },
  { id: 'R38', name: 'unchanged values are assessed as changes (03-B)', file: ASSESS,
    edits: [['    (field) => !sameValue(field, event[field], patch[field]),', '    () => true,']], suites: both },
  { id: 'R39', name: 'a venue’s repeated reason is listed twice (03-A merge)', file: ASSESS,
    edits: [['    if (!existing.details.includes(detail)) existing.details.push(detail);', '    existing.details.push(detail);']], suites: both },
  { id: 'R40', name: 'booking-impacting fields are never assessed (03-F, 03-A)', file: ASSESS,
    edits: [["    if (FIELD_POLICY[field] !== 'review_if_impacting') continue;", '    continue;']], suites: both },
  { id: 'R41', name: 'an unknown request id is not refused (11-B)', file: SERVICE,
    edits: [['    if (!request) throw new NotFoundException(REVIEW_MESSAGES.requestNotFound);', '    if (false) throw new NotFoundException(REVIEW_MESSAGES.requestNotFound);']], suites: both },
  { id: 'R42', name: 'the conflict preview writes to the request (03-H read-only)', file: SERVICE,
    edits: [['    this.requirePending(request);\n    return {\n      requestId: request.id,', "    this.requirePending(request);\n    await this.repository.query('UPDATE event_change_requests SET safety_check_reset = NOT safety_check_reset WHERE id = $1', [request.id]);\n    return {\n      requestId: request.id,"]], suites: both },
  { id: 'R43', name: 'the preview ignores the requested window (03-D)', file: SERVICE,
    edits: [['    const window = { start: patch.startDateTime, end: patch.endDateTime };', '    const window = { start: undefined, end: undefined };']], suites: both },
  { id: 'R44', name: 'the decider is recorded by id instead of name or email (10-SUP-ACTOR)', file: SERVICE,
    edits: [["  return user.name ?? user.email ?? 'Coordinator';", '  return user.uid;']], suites: both },
  { id: 'R45', name: 'approval skips the cancelled-event guard (04-E)', file: SERVICE,
    edits: [['      this.requirePending(request);\n      assertArrangementsEditable(event.status);\n      if (!OPEN', '      this.requirePending(request);\n      if (!OPEN']], suites: both },
  { id: 'R46', name: 'every approved event moves to Planning, not only a Confirmed one (08-D)', file: SERVICE,
    edits: [["if (event.status === 'Confirmed') {", "if (event.status !== 'Draft') {"]], suites: both },
  { id: 'R47', name: 'unknown fields in a denial body are accepted (11-B)', file: SERVICE,
    edits: [["    const unknown = Object.keys(data).filter((key) => key !== 'reason');", '    const unknown: string[] = [];']], suites: both },
  { id: 'R48', name: 'marking one arrangement re-checked marks them all (09-B)', file: SERVICE,
    edits: [['        entry.id === itemId\n          ? {', '        true\n          ? {']], suites: both },
  { id: 'R49', name: 'the audit log is returned oldest first (10-B)', file: SERVICE,
    edits: [['ORDER BY decided_at DESC, recorded_at DESC, id', 'ORDER BY decided_at ASC, recorded_at DESC, id']], suites: both },
  { id: 'R50', name: 'the deny route swaps the event and request ids (controller delegation)', file: CTRL,
    edits: [['return this.review.deny(\n      request[CURRENT_USER_REQUEST_KEY],\n      id,\n      requestId,', 'return this.review.deny(\n      request[CURRENT_USER_REQUEST_KEY],\n      requestId,\n      id,']], suites: both },
];
