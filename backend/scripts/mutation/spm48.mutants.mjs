// SPM-48 backend mutants (Monitor Workspace Queue & Status, Coordinator), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm48.mutants.mjs            # every mutant (e2e needs DATABASE_URL)
//   node scripts/mutation/run.mjs --mutants spm48.mutants.mjs --only Q3
// Each edit is [from, to]; `from` must occur exactly once in the file (run.mjs reports MISAPPLIED otherwise).
// The runner mutates a scratch copy, never the repository tree. No mutant is claimed equivalent.
// The frontend mutants are in frontend/scripts/testing/mutation/spm48.mutants.mjs.
export const SUITES = {
  // Pure rules, the service with mocked reads, the controller metadata and the safety-source mapping.
  unit: {
    args: ['run', 'src/events/queue', 'src/events/status/safety-check.source.spec.ts'],
  },
  // Real PostgreSQL: every MONITOR-QUEUE case over HTTP, with real assign, reassign, change-request and cancel routes.
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/coordinator-queue.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const RULES = 'src/events/queue/queue-indicators.ts';
const SERVICE = 'src/events/queue/coordinator-queue.service.ts';
const CONTROLLER = 'src/events/queue/coordinator-queue.controller.ts';
const SAFETY = 'src/events/status/safety-check.source.ts';
const UNAVAILABLE = 'src/events/venue-unavailable.ts';
const both = ['unit', 'e2e'];

export const MUTANTS = [
  { id: 'Q1', name: 'coordinator role check removed: an organiser reads the queue (01-D)', file: SERVICE,
    edits: [["if (!identity.roles.includes('COORDINATOR'))", 'if (false)']],
    suites: both },
  { id: 'Q2', name: 'coordinator scope dropped from the indicator read: another coordinator’s facts are merged (01-A)', file: SERVICE,
    edits: [['WHERE e.id = ANY($1::uuid[]) AND e.coordinator_id = $2', 'WHERE e.id = ANY($1::uuid[]) AND $2::text IS NOT NULL']],
    suites: ['unit'] },
  { id: 'Q3', name: 'events missing from the indicator read are kept (01-A, reassigned between reads)', file: SERVICE,
    edits: [['      if (!facts) return [];', "      if (!facts) return [{ ...record, queue: null }];"]],
    suites: ['unit'] },
  { id: 'Q4', name: 'status filter ignored (01-SUP-FILTER)', file: SERVICE,
    edits: [['const listed = wanted ? records.filter((record) => wanted.includes(record.status)) : records;', 'const listed = records;']],
    suites: both },
  { id: 'Q5', name: 'unknown status filter accepted instead of 400 (01-SUP-FILTER)', file: SERVICE,
    edits: [['    if (!filter.ok) throw new BadRequestException', '    if (false) throw new BadRequestException']],
    suites: both },
  { id: 'Q6', name: 'no-store removed from the queue route (04-A)', file: CONTROLLER,
    edits: [["  @Header('Cache-Control', 'no-store')\n", '']],
    suites: both },
  { id: 'Q7', name: 'expired booking statuses read as active: cancelled bookings still flag the venue (09-B)', file: SERVICE,
    edits: [["AND b.status IN ('pending', 'approved')", "AND b.status IN ('pending', 'approved', 'cancelled')"]],
    suites: ['e2e', 'unit'] },
  { id: 'Q8', name: 'blockout overlap check dropped: every booking at a venue with any period flagged unavailable (09-A)', file: UNAVAILABLE,
    edits: [["       AND u.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)\n       AND u.end_at > b.start_at - make_interval(mins => v.setup_time_minutes))", ')']],
    suites: ['e2e'] },
  { id: 'Q9', name: 'hold active at the expiry instant (08-B boundary)', file: RULES,
    edits: [['return expiresAt.getTime() > now.getTime();', 'return expiresAt.getTime() >= now.getTime();']],
    suites: both },
  { id: 'Q10', name: 'a plain pending request (no expiry) treated as a hold (08-A)', file: RULES,
    edits: [[".filter((booking) => booking.status === 'pending' && booking.holdExpiresAt !== null)", ".filter((booking) => booking.status === 'pending')"]],
    suites: ['unit'] },
  { id: 'Q11', name: 'an expired hold still flags its unavailable venue (09-A, 08-B)', file: RULES,
    edits: [['          holdIsActive(booking.holdExpiresAt, now)),', '          true),']],
    suites: ['unit'] },
  { id: 'Q12', name: 'rejected safety outcome not shown (07-C)', file: RULES,
    edits: [["if (safetyState === 'rejected') return 'REJECTED';", "if (safetyState === 'rejected') return null;"]],
    suites: both },
  { id: 'Q13', name: 'reset safety check not shown (06-B)', file: RULES,
    edits: [["if (!safetyState) return safetyReset ? 'RESET' : null;", 'if (!safetyState) return null;']],
    suites: both },
  { id: 'Q14', name: 'terminal events keep their safety state (05-B)', file: RULES,
    edits: [['  if (TERMINAL_STATUSES.includes(status)) return null;\n  if (!safetyState)', '  if (!safetyState)']],
    suites: ['unit'] },
  { id: 'Q15', name: 'terminal events keep holds and venue flags (05-B)', file: RULES,
    edits: [['  const holds = terminal ? [] : deriveHolds(facts.bookings, now);', '  const holds = deriveHolds(facts.bookings, now);']],
    suites: ['unit'] },
  { id: 'Q16', name: 'Submitted not counted as needing action (05-B)', file: RULES,
    edits: [["if (status === 'Submitted') actions.push('AWAITING_REVIEW');", ''] ],
    suites: both },
  { id: 'Q17', name: 'expired hold not counted as needing action (05-B, 08-B)', file: RULES,
    edits: [["if (holds.some((hold) => hold.state === 'EXPIRED')) actions.push('HOLD_EXPIRED');", ''] ],
    suites: both },
  { id: 'Q18', name: 'needsAction always false (05-B)', file: RULES,
    edits: [['needsAction: actions.length > 0', 'needsAction: false']],
    suites: both },
  { id: 'Q19', name: 'status filter matched case-sensitively (01-SUP-FILTER)', file: RULES,
    edits: [['const match = QUEUE_STATUSES.find((status) => status.toLowerCase() === value.toLowerCase());', 'const match = QUEUE_STATUSES.find((status) => status === value);']],
    suites: both },
  { id: 'Q20', name: 'rejected safety check maps to no readiness state (07-C)', file: SAFETY,
    edits: [["  rejected: 'Rejected',\n", '']],
    suites: ['unit'] },
  // Q21 and Q22 come from Test Review 1 (TR-01, probes R1 and R2): the AC9 overlap is exclusive at both ends.
  { id: 'Q21', name: 'AC9 overlap inclusive at both ends: a period touching the widened window flags it (09-A boundary)', file: UNAVAILABLE,
    edits: [['u.start_at < b.end_at +', 'u.start_at <= b.end_at +'], ['u.end_at > b.start_at -', 'u.end_at >= b.start_at -']],
    suites: ['e2e'] },
  { id: 'Q22', name: 'AC9 overlap inclusive before the booking: a period ending as setup begins flags it (09-A boundary)', file: UNAVAILABLE,
    edits: [['u.end_at > b.start_at -', 'u.end_at >= b.start_at -']],
    suites: ['e2e'] },
  // Q23 to Q25: AC9 counts the venue's setup and turnaround time (owner decision, 23 Oct 2026; RR-01).
  { id: 'Q23', name: 'setup time ignored: a period inside the setup time does not flag the booking (09-A buffers)', file: UNAVAILABLE,
    edits: [['b.start_at - make_interval(mins => v.setup_time_minutes)', 'b.start_at']],
    suites: ['e2e'] },
  { id: 'Q24', name: 'turnaround time ignored: a period inside the turnaround time does not flag the booking (09-A buffers)', file: UNAVAILABLE,
    edits: [['b.end_at + make_interval(mins => v.turnaround_time_minutes)', 'b.end_at']],
    suites: ['e2e'] },
  { id: 'Q25', name: 'setup and turnaround swapped (09-A buffers)', file: UNAVAILABLE,
    edits: [['mins => v.turnaround_time_minutes', 'mins => v.TMP_SETUP'], ['mins => v.setup_time_minutes', 'mins => v.turnaround_time_minutes'], ['mins => v.TMP_SETUP', 'mins => v.setup_time_minutes']],
    suites: ['e2e'] },
  // Q26 comes from Code Quality Review 1 (CQ-48-02): indicators use the listed record's status.
  { id: 'Q26', name: 'indicators read a fixed status instead of the listed record status (05-B)', file: SERVICE,
    edits: [['status: queueStatusOf(record.status as string),', "status: 'Planning',"]],
    suites: ['unit'] },
  { id: 'Q27', name: 'listed status matched case-sensitively: lowercase API statuses lose their rules (02-B, 05-B)', file: RULES,
    edits: [['return QUEUE_STATUSES.find((status) => status.toLowerCase() === value.toLowerCase()) ?? value;', 'return QUEUE_STATUSES.find((status) => status === value) ?? value;']],
    suites: ['unit'] },
  // Q28 and Q29 come from Test Review 3 (TR-05, probes R6 and R7): each side uses its own buffer.
  { id: 'Q28', name: 'setup side uses the turnaround time (09-A buffers)', file: UNAVAILABLE,
    edits: [['b.start_at - make_interval(mins => v.setup_time_minutes)', 'b.start_at - make_interval(mins => v.turnaround_time_minutes)']],
    suites: ['e2e'] },
  { id: 'Q29', name: 'both sides use the smaller of setup and turnaround (09-A buffers)', file: UNAVAILABLE,
    edits: [['b.start_at - make_interval(mins => v.setup_time_minutes)', 'b.start_at - make_interval(mins => LEAST(v.setup_time_minutes, v.turnaround_time_minutes))'],
            ['b.end_at + make_interval(mins => v.turnaround_time_minutes)', 'b.end_at + make_interval(mins => LEAST(v.setup_time_minutes, v.turnaround_time_minutes))']],
    suites: ['e2e'] },
];
