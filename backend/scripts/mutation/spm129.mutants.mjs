export const SUITES = {
  unit: { args: ['run', 'src/events/safety-officer/safety-officer.service.spec.ts', 'src/events/status/checklist.spec.ts', 'src/events/status/readiness.spec.ts', 'src/events/status/safety-feedback-resolution.spec.ts', 'src/events/status/arrangements.reader.spec.ts'] },
  e2e: { args: ['run', '--config', './vitest.config.e2e.ts', 'test/safety-officer.e2e-spec.ts'] },
  feedback: { args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-safety-feedback.e2e-spec.ts'] },
};

const SERVICE = 'src/events/safety-officer/safety-officer.service.ts';
const E2E = 'test/safety-officer.e2e-spec.ts';
const UNIT = 'src/events/safety-officer/safety-officer.service.spec.ts';
const CHECKLIST = 'src/events/status/checklist.spec.ts';
const READINESS = 'src/events/status/readiness.spec.ts';
const FEEDBACK_RESOLUTION = 'src/events/status/safety-feedback-resolution.spec.ts';
const unit = (title) => ({ suite: 'unit', file: UNIT, title });
const checklistUnit = (title) => ({ suite: 'unit', file: CHECKLIST, title });
const readinessUnit = (title) => ({ suite: 'unit', file: READINESS, title });
const feedbackUnit = (title) => ({ suite: 'unit', file: FEEDBACK_RESOLUTION, title });
const readerUnit = (title) => ({ suite: 'unit', file: 'src/events/status/arrangements.reader.spec.ts', title });
const e2e = (title) => ({ suite: 'e2e', file: E2E, title });
const feedbackE2e = (title) => ({ suite: 'feedback', file: 'test/events-safety-feedback.e2e-spec.ts', title });

export const MUTANTS = [
  {
    id: 'S129-01', name: 'a non-Safety-Officer can read or decide (SAFETY-QUEUE-01)', file: SERVICE, suites: ['unit', 'e2e'],
    edits: [["if (!identity.roles.includes('SAFETY_OFFICER'))", 'if (false)']],
    testMappings: [unit('SAFETY-QUEUE-01 requires the Safety Officer role before reading the queue'), e2e('SAFETY-QUEUE-01 refuses unauthenticated and non-Safety-Officer reads')],
  },
  {
    id: 'S129-02', name: 'the queue includes an event with an unconfirmed venue (SAFETY-QUEUE-06)', file: SERVICE, suites: ['e2e'],
    edits: [['return checklist.canRequestSafetyCheck;', "return checklist.canRequestSafetyCheck || checklist.blocking.includes('venue');"]],
    testMappings: [e2e('SAFETY-QUEUE-06 excludes each event with incomplete venue or technical arrangements')],
  },
  {
    id: 'S129-03', name: 'the queue includes an event without technical confirmation (SAFETY-QUEUE-06)', file: SERVICE, suites: ['e2e'],
    edits: [['return checklist.canRequestSafetyCheck;', "return checklist.canRequestSafetyCheck || checklist.blocking.includes('equipment');"]],
    testMappings: [e2e('SAFETY-QUEUE-06 excludes each event with incomplete venue or technical arrangements')],
  },
  {
    id: 'S129-04', name: 'the detail projection changes venue capacity (SAFETY-QUEUE-02)', file: SERVICE, suites: ['e2e'],
    edits: [["'name', v.name, 'location', v.location, 'capacity', v.capacity,", "'name', v.name, 'location', v.location, 'capacity', v.capacity + 1,"]],
    testMappings: [e2e('SAFETY-QUEUE-02 reads attendance, capacity, layout, and accessibility from linked database rows')],
  },
  {
    id: 'S129-05', name: 'known venue restrictions are replaced in the detail projection (SAFETY-QUEUE-04)', file: SERVICE, suites: ['e2e'],
    edits: [["'restrictions', v.operating_information,", "'restrictions', v.name,"]],
    testMappings: [e2e('SAFETY-QUEUE-04 returns the venue restrictions from PostgreSQL')],
  },
  {
    id: 'S129-06', name: 'a decision does not persist its status (SAFETY-QUEUE-05)', file: SERVICE, suites: ['e2e'],
    edits: [["UPDATE event_safety_checks SET status = $2,", "UPDATE event_safety_checks SET status = 'pending',"]],
    testMappings: [e2e('SAFETY-QUEUE-05 persists a response and removes the event from the subsequent queue'), e2e('SAFETY-QUEUE-05 persists an approval without feedback')],
  },
  {
    id: 'S129-07', name: 'a rejection does not persist its feedback row (SAFETY-QUEUE-05)', file: SERVICE, suites: ['e2e'],
    edits: [["INSERT INTO safety_check_feedback_items (event_id, feedback_text) VALUES ($1, $2)", "SELECT $1, $2 WHERE false"]],
    testMappings: [e2e('SAFETY-QUEUE-05 persists a response and removes the event from the subsequent queue')],
  },
  {
    id: 'S129-08', name: 'a stale pending check can receive a decision after its venue becomes unconfirmed (SAFETY-QUEUE-05)', file: SERVICE, suites: ['e2e'],
    edits: [["    return checklist.canRequestSafetyCheck;", "    return true;"]],
    testMappings: [e2e('SAFETY-QUEUE-05 refuses a response when the venue is no longer confirmed')],
  },
  {
    id: 'S129-09', name: 'an approved tentative hold qualifies as a confirmed venue (SAFETY-QUEUE-06)', file: SERVICE, suites: ['e2e'],
    edits: [['return checklist.canRequestSafetyCheck;', "return checklist.canRequestSafetyCheck || snapshot.venueBookings.some((booking) => booking.status === 'approved' && booking.requestKind === 'tentative_hold');"]],
    testMappings: [e2e('SAFETY-QUEUE-06 excludes an approved tentative hold without a confirmed booking')],
  },
  {
    id: 'S129-10', name: 'an incomplete extra venue booking does not block queue eligibility (SAFETY-QUEUE-06)', file: SERVICE, suites: ['e2e'],
    edits: [['return checklist.canRequestSafetyCheck;', "return checklist.canRequestSafetyCheck || snapshot.venueBookings.some((booking) => booking.status === 'pending');"]],
    testMappings: [e2e('SAFETY-QUEUE-06 excludes an event with approved and pending venue bookings')],
  },
  {
    id: 'S129-11', name: 'the technical requirements are projected from the wrong event field (SAFETY-QUEUE-03)', file: SERVICE, suites: ['e2e'],
    edits: [['equipmentNeeds: row.equipment_needs,', 'equipmentNeeds: null,']],
    testMappings: [e2e('SAFETY-QUEUE-03 returns technical arrangements and reserved equipment from PostgreSQL')],
  },
  {
    id: 'S129-12', name: 'reserved equipment is omitted from Safety Officer event details (SAFETY-QUEUE-03)', file: SERVICE, suites: ['e2e'],
    edits: [["WHERE r.event_id = e.id AND r.status = 'Reserved'", "WHERE r.event_id = e.id AND r.status = 'Requested'"]],
    testMappings: [e2e('SAFETY-QUEUE-03 returns technical arrangements and reserved equipment from PostgreSQL')],
  },
  {
    id: 'S129-13', name: 'a Reserved equipment line is incorrectly required to have a no-equipment confirmation timestamp (SAFETY-QUEUE-06)', file: SERVICE, suites: ['e2e'],
    edits: [['return checklist.canRequestSafetyCheck;', 'return checklist.canRequestSafetyCheck && event.equipment_confirmed_at !== null;']],
    testMappings: [e2e('SAFETY-QUEUE-06 excludes each event with incomplete venue or technical arrangements')],
  },
  {
    id: 'S129-14', name: 'a venue flagged unavailable is accepted by the shared checklist for a safety decision (SAFETY-QUEUE-05)', file: 'src/events/status/checklist.ts', suites: ['e2e'],
    edits: [["return booking.venueUnavailable ? 'unavailable' : 'confirmed';", "return 'confirmed';"]],
    testMappings: [e2e('SAFETY-QUEUE-05 refuses a decision when a confirmed venue later becomes unavailable')],
  },
  {
    id: 'S129-15', name: 'matching approved replacement fails to resolve rejected booking history (SAFETY-QUEUE-06)', file: 'src/events/status/readiness.ts', suites: ['unit'],
    edits: [['return bookings.some((candidate) => {', 'return false && bookings.some((candidate) => {']],
    testMappings: [readinessUnit('SAFETY-QUEUE-06-SUP-HISTORY confirms Confirm is blocked without a same-venue full-slot replacement')],
  },
  {
    id: 'S129-16', name: 'released booking history blocks a confirmed replacement (SAFETY-QUEUE-06)', file: 'src/events/status/checklist.ts', suites: ['unit'],
    edits: [["(b) => b.status !== 'released' && b.status !== 'cancelled'", "(b) => b.status !== 'cancelled'"]],
    testMappings: [checklistUnit('ignores %s venue history only after a confirmed replacement')],
  },
  {
    id: 'S129-17', name: 'cancelled booking history blocks a confirmed replacement (SAFETY-QUEUE-06)', file: 'src/events/status/checklist.ts', suites: ['unit'],
    edits: [["(b) => b.status !== 'released' && b.status !== 'cancelled'", "(b) => b.status !== 'released'"]],
    testMappings: [checklistUnit('ignores %s venue history only after a confirmed replacement')],
  },
  {
    id: 'S129-18', name: 'arrangements are locked after the safety-check row (SAFETY-QUEUE-05)', file: SERVICE, suites: ['unit'],
    edits: [[
      `      const snapshot = await this.arrangements.read(client, eventId, { lock: true });
      if (!this.hasConfirmedChecklist(event.rows[0], snapshot))
        throw new ConflictException('This event is no longer awaiting a safety check.');
      const pending = await client.query<{ event_id: string }>(
        \`SELECT event_id FROM event_safety_checks WHERE event_id = $1 AND status = 'pending' FOR UPDATE\`, [eventId],
      );
      if (!pending.rows[0]) throw new ConflictException('This event is no longer awaiting a safety check.');`,
      `      const pending = await client.query<{ event_id: string }>(
        \`SELECT event_id FROM event_safety_checks WHERE event_id = $1 AND status = 'pending' FOR UPDATE\`, [eventId],
      );
      if (!pending.rows[0]) throw new ConflictException('This event is no longer awaiting a safety check.');
      const snapshot = await this.arrangements.read(client, eventId, { lock: true });
      if (!this.hasConfirmedChecklist(event.rows[0], snapshot))
        throw new ConflictException('This event is no longer awaiting a safety check.');`,
    ]],
    testMappings: [unit('uses the shared event, arrangements, safety-check lock order')],
  },
  {
    id: 'S129-19', name: 'approval stores response reason as rejection feedback (SAFETY-QUEUE-05)', file: SERVICE, suites: ['e2e'],
    edits: [["const feedback = decision === 'approved' ? null : reason;", 'const feedback = reason;']],
    testMappings: [e2e('SAFETY-QUEUE-05 persists an approval without feedback')],
  },
  {
    id: 'S129-20', name: 'rejected feedback can be re-requested before coordinator resolution (SAFETY-QUEUE-05)', file: 'src/events/status/safety-feedback-resolution.ts', suites: ['unit', 'feedback'],
    edits: [["return status === 'changes_needed' || status === 'rejected';", "return status === 'changes_needed';"]],
    testMappings: [feedbackUnit('allows resolution for rejected and changes-needed outcomes, but not other safety states'), feedbackE2e('SPM129-SUP-REJECT-RESOLUTION preserves a rejected reason until it is resolved')],
  },
  {
    id: 'S129-21', name: 'another venue resolves rejected booking history (SAFETY-QUEUE-06)', file: 'src/events/status/readiness.ts', suites: ['unit'],
    edits: [['candidate.venueId !== rejected.venueId ||', 'false ||']],
    testMappings: [readinessUnit('SAFETY-QUEUE-06-SUP-HISTORY confirms Confirm is blocked without a same-venue full-slot replacement'), checklistUnit('SAFETY-QUEUE-06 leaves rejected history blocking for another venue or incomplete slot coverage')],
  },
  {
    id: 'S129-22', name: 'an incompletely covered slot resolves rejected booking history (SAFETY-QUEUE-06)', file: 'src/events/status/readiness.ts', suites: ['unit'],
    edits: [['candidateStart <= rejectedStart && candidateEnd >= rejectedEnd', 'true']],
    testMappings: [readinessUnit('SAFETY-QUEUE-06-SUP-HISTORY confirms Confirm is blocked without a same-venue full-slot replacement'), checklistUnit('SAFETY-QUEUE-06 leaves rejected history blocking for another venue or incomplete slot coverage')],
  },
  {
    id: 'S129-25', name: 'partial overlap resolves a rejected full booking slot (SAFETY-QUEUE-06)', file: 'src/events/status/readiness.ts', suites: ['unit'],
    edits: [['candidateStart <= rejectedStart && candidateEnd >= rejectedEnd', 'candidateStart < rejectedEnd && candidateEnd > rejectedStart']],
    testMappings: [readinessUnit('SAFETY-QUEUE-06-SUP-HISTORY confirms Confirm is blocked without a same-venue full-slot replacement'), checklistUnit('SAFETY-QUEUE-06 leaves rejected history blocking for another venue or incomplete slot coverage')],
  },
  {
    id: 'S129-23', name: 'queue eligibility reads are serial for a multi-event queue (SAFETY-QUEUE-01)', file: SERVICE, suites: ['unit'],
    edits: [[
      'const eligibility = await Promise.all(candidates.rows.map((candidate) => this.hasConfirmedArrangements(this.database, candidate)));',
      'const eligibility: boolean[] = [];\n    for (const candidate of candidates.rows) eligibility.push(await this.hasConfirmedArrangements(this.database, candidate));',
    ]],
    testMappings: [unit('SAFETY-QUEUE-01 checks many eligible events concurrently without reordering them')],
  },
  {
    id: 'S129-24', name: 'Safety Officer details response can be cached (SAFETY-QUEUE-02)', file: 'src/events/safety-officer/safety-officer.controller.ts', suites: ['unit', 'e2e'],
    edits: [["  @Get('queue/:eventId')\n  @Header('Cache-Control', 'no-store')\n", "  @Get('queue/:eventId')\n"]],
    testMappings: [unit('passes the session identity to queue, detail, and decision operations'), e2e('SAFETY-QUEUE-02 reads attendance, capacity, layout, and accessibility from linked database rows')],
  },
  {
    id: 'S129-26', name: 'the venue fact mapper collapses distinct venues into their request kind (SAFETY-QUEUE-06)', file: 'src/events/status/arrangements.reader.ts', suites: ['unit', 'e2e'],
    edits: [['venueId: row.venue_id,', 'venueId: row.request_kind,']],
    testMappings: [readerUnit('SAFETY-QUEUE-06-SUP-HISTORY preserves distinct venue identities and slot boundaries from PostgreSQL rows'), e2e('SAFETY-QUEUE-06-SUP-HISTORY blocks %s replacement through queue, detail, decision and Confirm')],
  },
  {
    id: 'S129-27', name: 'the venue fact mapper substitutes request time for the booking start (SAFETY-QUEUE-06)', file: 'src/events/status/arrangements.reader.ts', suites: ['unit', 'e2e'],
    edits: [['start: row.start_at.toISOString(),', 'start: row.created_at.toISOString(),']],
    testMappings: [readerUnit('SAFETY-QUEUE-06-SUP-HISTORY preserves distinct venue identities and slot boundaries from PostgreSQL rows'), e2e('SAFETY-QUEUE-06-SUP-HISTORY blocks %s replacement through queue, detail, decision and Confirm')],
  },
  {
    id: 'S129-28', name: 'the venue fact mapper substitutes the booking start for its end (SAFETY-QUEUE-06)', file: 'src/events/status/arrangements.reader.ts', suites: ['unit', 'e2e'],
    edits: [['end: row.end_at.toISOString(),', 'end: row.start_at.toISOString(),']],
    testMappings: [readerUnit('SAFETY-QUEUE-06-SUP-HISTORY preserves distinct venue identities and slot boundaries from PostgreSQL rows'), e2e('SAFETY-QUEUE-06-SUP-HISTORY accepts a same-venue full-slot replacement through queue, decision and Confirm')],
  },
];
