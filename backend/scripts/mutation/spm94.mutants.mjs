// SPM-94 backend mutants (Track My Event Status, Organiser), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm94.mutants.mjs            # every mutant (needs DATABASE_URL)
//   node scripts/mutation/run.mjs --mutants spm94.mutants.mjs --only M3e
// Each edit is [from, to]; `from` must occur exactly once in the file (run.mjs reports MISAPPLIED otherwise).
// The runner mutates a scratch copy, never the repository tree.
//
// IDs M2, M3, M3e, M5 to M9, M8e and M12 are the spec's mutants (docs/specs/SPM-94-test-results.md). X1 to X3 are
// extra mutants found while writing the suite. The frontend mutants (M9, M12, X4 to X6) are in
// frontend/scripts/testing/mutation/spm94.mutants.mjs.
//
// `equivalent: true` is a claim that the survivor cannot change observable behaviour; none is claimed here.
export const SUITES = {
  // Pure derivations: assignment and safety indicators, boundaries and the terminal-before-state order.
  unit: {
    args: ['run', 'src/events/status/event-indicators.spec.ts', 'src/events/events.service.spec.ts'],
  },
  // Real PostgreSQL: every TRACK-EVENT-STATUS case over HTTP (scope, owner check, no-store, indicators, approval).
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-status-tracking.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
  // The coordinator's own 404 path (EVE-REV-04-F), which is the only test that kills M3e.
  assignE2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-assign.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const SERVICE = 'src/events/events.service.ts';
const CONTROLLER = 'src/events/events.controller.ts';
const INDICATORS = 'src/events/status/event-indicators.ts';

const both = ['unit', 'e2e'];

export const MUTANTS = [
  { id: 'M2', name: 'owner filter removed from the organiser list (01-A)', file: SERVICE,
    edits: [['FROM events WHERE organiser_id = $1 ORDER BY start_date_time ASC, created_at DESC', 'FROM events WHERE $1::text IS NOT NULL ORDER BY start_date_time ASC, created_at DESC']],
    suites: ['e2e'] },
  { id: 'M3', name: 'detail route without the owner check, both 403 and 404 (01-C)', file: SERVICE,
    edits: [
      ['if (!isOwningOrganiser && isOrganiserOnly) {', 'if (false) {'],
      ['if (!isOwningOrganiser && !isAssignedCoordinator && !isAttendeeViewable) {', 'if (false) {'],
    ],
    suites: both },
  { id: 'M3e', name: 'the 404 owner branch disabled only; the organiser 403 still applies', file: SERVICE,
    edits: [['if (!isOwningOrganiser && !isAssignedCoordinator && !isAttendeeViewable) {', 'if (false) {']],
    suites: ['e2e', 'assignE2e'] },
  { id: 'M5', name: 'no-store removed from the organiser list (04-A)', file: CONTROLLER,
    edits: [["  @Header('Cache-Control', 'no-store')\n  list(", '  list(']],
    suites: ['e2e'] },
  { id: 'M6', name: 'assignment indicator for any unassigned event (02-A)', file: INDICATORS,
    edits: [["status === 'Submitted' && !coordinatorId", '!coordinatorId']],
    suites: both },
  { id: 'M7', name: 'assignment indicator persists after assignment (02-B)', file: INDICATORS,
    edits: [["status === 'Submitted' && !coordinatorId", "status === 'Submitted'"]],
    suites: both },
  { id: 'M8', name: 'changes requested and cleared swapped (03-B)', file: INDICATORS,
    edits: [["changes_needed: 'CHANGES_REQUESTED'", "changes_needed: 'CLEARED'"]],
    suites: both },
  { id: 'M8e', name: 'the same swap, seen through the API (03-B)', file: INDICATORS,
    edits: [["changes_needed: 'CHANGES_REQUESTED'", "changes_needed: 'CLEARED'"]],
    suites: ['e2e'] },
  { id: 'X1', name: 'an approved safety check shown as awaiting (03-B, 03-C)', file: INDICATORS,
    edits: [["approved: 'CLEARED'", "approved: 'AWAITING_CHECK'"]],
    suites: ['e2e'] },
  { id: 'X2', name: 'terminal statuses no longer suppress the safety indicator (D5)', file: INDICATORS,
    edits: [["if ((SAFETY_SUPPRESSED_STATUSES as readonly string[]).includes(status)) return null;", '']],
    suites: ['unit'] },
  { id: 'X3', name: 'the 403 body also returns the event id and status (01-C: no event data)', file: SERVICE,
    edits: [["throw new ForbiddenException('You can only view your own events.');",
      "throw new ForbiddenException({ message: 'You can only view your own events.', eventId: id, eventStatus: row.status });"]],
    suites: ['e2e'] },
  { id: 'X10', name: 'D6 exemption widened: every non-owning organiser gets 403, whatever their other roles', file: SERVICE,
    edits: [["!user.roles.some((role) => role === 'COORDINATOR' || role === 'ATTENDEE')", 'true']],
    suites: ['unit'] },
  { id: 'X11', name: 'detail route without no-store (04-A revisit)', file: CONTROLLER,
    edits: [["  @Get('events/:id')\n  @Header('Cache-Control', 'no-store')\n", "  @Get('events/:id')\n"]],
    suites: ['e2e'] },
  { id: 'X12', name: 'safety indicator dropped while the event awaits assignment (AC2 with AC3)', file: SERVICE,
    edits: [['safetyIndicator: deriveSafetyIndicator(row.safety_status, row.status) }', 'safetyIndicator: row.coordinator_id ? deriveSafetyIndicator(row.safety_status, row.status) : null }']],
    suites: ['e2e'] },
];
