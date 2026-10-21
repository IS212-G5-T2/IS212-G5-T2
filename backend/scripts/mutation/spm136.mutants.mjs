// SPM-136 backend mutants (Cancel an Event and Release its Reservations), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm136.mutants.mjs            # every mutant (needs DATABASE_URL)
//   node scripts/mutation/run.mjs --mutants spm136.mutants.mjs --only M7,M16
// Each edit is [from, to]; `from` must occur exactly once in the file (run.mjs reports MISAPPLIED otherwise).
// The runner mutates a scratch copy, never the repository tree.
//
// IDs M1 to M20 follow docs/specs/SPM-136-test-results.md (brief list order). The waiting list exists now (SPM-138), so
// its wiring to the cancellation is mutated too (TR-136-17):
//   W1  waitlistReleaser unregistered from DEFAULT_RELEASERS            killed by suite waitlist12 (12-A) and cancelE2e (08-A combined)
//   W2  waitlist releaser's release() a no-op                          killed by waitlist12 (12-A) and cancelE2e (08-A combined)
//   W6  waiting notice INSERT dropped                                  killed by waitlist12 (12-A, 12-C-REL)
//   W7  ON CONFLICT removed from the waiting notice  EQUIVALENT: no reachable state gives one recipient both a Waitlisted row
//       and a core notice (the join refuses the organiser and the assigned coordinator, see W8)
//   W8  owner check removed from the waiting-list join  killed by waitlist12 (12-D-COO-REFUSED, 12-D-ORG-REFUSED)
//   W4  event status ignored for a Cancelled waiting entry (TR-136-15) killed by unitWithdraw (registrations.withdraw.spec.ts)
// Suite 'waitlist12' runs test/registrations.waitlist.e2e-spec.ts and each mutant names its JOIN-WAITLIST-12 cases with
// testMappings, so a survivor is reported as a survivor, not hidden by the file's other tests.
// M9 (the dialog dismiss sending a request) is a FRONTEND mutant. It cannot be run from this backend runner
// and is run from a scratch copy of frontend/ (see docs/specs/SPM-136-test-results.md).
//
// `equivalent: true` is a claim that the survivor cannot change observable behaviour; the claim is explained
// in its name. The runner reports any non-equivalent survivor and exits 1.
export const SUITES = {
  // Pure rules, the guard, the releasers, the cancel transaction (recorded statements) and the withdrawal refusal.
  // The whole unit suite: the killers of the guard, status and notification mutants sit in several spec files.
  unit: {
    args: ['run'],
  },
  // Real PostgreSQL: every case of CANCEL-EVENT-01 to 08 over HTTP, and the guard on every existing route.
  e2e: {
    args: [
      'run', '--config', './vitest.config.e2e.ts',
      'test/events-cancel.e2e-spec.ts', 'test/events-cancelled-guard.e2e-spec.ts',
    ],
    needsEnv: ['DATABASE_URL'],
  },
  // TR-136-17: the waiting-list wiring (JOIN-WAITLIST-12 cases, and the TR-136-18 dual-role cases in the same file).
  waitlist12: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/registrations.waitlist.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
  // TR-136-19: the cancel e2e file (the combined CANCEL-EVENT-08-A waiting-list case, which W1 and W2 must break).
  cancelE2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-cancel.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
  // TR-136-15: the withdrawal unit spec (W4 and the Cancelled-entry cases).
  unitWithdraw: {
    args: ['run', 'src/registrations/withdrawal/registrations.withdraw.spec.ts'],
  },
  // SPM-136 test-quality pass: file-scoped unit suites so each new kill is a named test, not the whole unit suite.
  unitCancelRules: {
    args: ['run', 'src/events/cancel/cancel-rules.spec.ts'],
  },
  unitCancelService: {
    args: ['run', 'src/events/cancel/cancel-event.service.spec.ts'],
  },
  unitStatusRemoval: {
    args: ['run', 'src/events/status/status.removal.spec.ts'],
  },
  unitNotifications: {
    args: ['run', 'src/events/cancelled-notifications.spec.ts'],
  },
  // Release registry and its releasers, by file, so each releaser kill is linked to its spec.
  unitRelease: {
    args: ['run', 'src/events/cancel/release.registry.spec.ts'],
  },
  unitGuard: {
    args: ['run', 'src/events/cancelled-guard.spec.ts'],
  },
  unitReleasedVenue: {
    args: ['run', 'src/events/status/released-venue.spec.ts'],
  },
};

const CANCEL = 'src/events/cancel/cancel-event.service.ts';
const RULES = 'src/events/cancel/cancel-rules.ts';
const VENUE = 'src/venues/release/venue-booking.releaser.ts';
const EQUIPMENT = 'src/equipment/release/equipment-reservation.releaser.ts';
const REGISTRATION = 'src/registrations/release/registration.releaser.ts';
const CLARIFICATIONS = 'src/clarifications/clarifications.service.ts';
const both = ['unit', 'e2e'];

// Reviewer's (TR-136-03) helper and file aliases for the guard, status, notification and release mutants (S1 to S24).
const ST = 'src/events/status/status.service.ts';
const PL = 'src/events/planning/event-planning.service.ts';
const CL = 'src/clarifications/clarifications.service.ts';
const RG = 'src/registrations/registrations.service.ts';
const CA = 'src/events/cancel/cancel-event.service.ts';
const RU = 'src/events/cancel/cancel-rules.ts';
const VE = 'src/venues/release/venue-booking.releaser.ts';
const EQ = 'src/equipment/release/equipment-reservation.releaser.ts';
const RE = 'src/registrations/release/registration.releaser.ts';
const EV = 'src/events/events.service.ts';
const GU = 'src/events/cancelled-guard.ts';
const pre = '    const user = this.requireUser(identity);\n    const event = await this.assignedEventOrThrow(user, eventId);\n';
const g = '    assertEventNotCancelled(event.status);\n';
const strip = (head) => [head + pre + g, head + pre];

export const MUTANTS = [
  { id: 'M1', name: 'assignment check removed, before the lock and on the locked row (01-C)', file: CANCEL,
    edits: [
      ['    const event = await this.findEvent(eventId);\n    if (!event) throw new NotFoundException(CANCEL_MESSAGES.notFound);\n    if (!this.mayCancel(user, event)) throw this.notAllowed();',
        '    const event = await this.findEvent(eventId);\n    if (!event) throw new NotFoundException(CANCEL_MESSAGES.notFound);'],
      ['    if (!this.mayCancel(user, event)) throw this.notAllowed();\n    if (!isCancellable(event.status)) throw this.notCancellable();',
        '    if (!isCancellable(event.status)) throw this.notCancellable();'],
    ],
    suites: both },
  { id: 'M2', name: 'Completed is cancellable (03-B)', file: RULES,
    edits: [["export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed'] as const;",
      "export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed', 'Completed'] as const;"]],
    suites: both },
  { id: 'M3', name: 'confirmation check removed (02-C)', file: CANCEL,
    edits: [['if (!isConfirmed(body))', 'if (false)']],
    suites: both },
  { id: 'M4', name: 'handler is a no-op: returns Cancelled without writing (03-A, 04-A)', file: CANCEL,
    edits: [['return this.database.transaction((client) => this.cancelInside(client, user, eventId, now));',
      "return { eventId, status: 'Cancelled', message: CANCEL_MESSAGES.cancelled(eventId) };"]],
    suites: both },
  { id: 'M5', name: 'only the first venue booking is released (04-A)', file: VENUE,
    edits: [["WHERE event_id = $1 AND status IN ('pending', 'approved')",
      "WHERE event_id = $1 AND status IN ('pending', 'approved') AND id = (SELECT id FROM venue_bookings WHERE event_id = $1 ORDER BY id LIMIT 1)"]],
    suites: both },
  { id: 'M6', name: 'only the first equipment reservation is released (05-A)', file: EQUIPMENT,
    edits: [["WHERE event_id = $1 AND status IN ('Requested', 'Reserved', 'Unavailable')",
      "WHERE event_id = $1 AND status IN ('Requested', 'Reserved', 'Unavailable') AND id = (SELECT id FROM equipment_reservations WHERE event_id = $1 ORDER BY id LIMIT 1)"]],
    suites: both },
  { id: 'M7', name: 'the Coordinator Lead may cancel (01-C E)', file: CANCEL,
    edits: [["const assigned = user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid;",
      "const assigned = user.roles.includes('COORDINATOR_LEAD') || (user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid);"]],
    suites: both },
  { id: 'M8', name: 'any Organiser may cancel (01-C B)', file: CANCEL,
    edits: [["const submitted = user.roles.includes('ORGANISER') && event.organiser_id === user.uid;",
      "const submitted = user.roles.includes('ORGANISER');"]],
    suites: both },
  { id: 'M10', name: 'truthy confirmation accepted (02-C)', file: RULES,
    edits: [['return (body as { confirmed?: unknown }).confirmed === true;',
      'return Boolean((body as { confirmed?: unknown }).confirmed);']],
    suites: both },
  { id: 'M11', name: 'cancelled_at taken from SQL now() (03-A)', file: CANCEL,
    edits: [['SET status = \'Cancelled\', cancelled_by = $2, cancelled_at = $3, updated_at = $3',
      'SET status = \'Cancelled\', cancelled_by = $2, cancelled_at = now(), updated_at = $3']],
    suites: both },
  { id: 'M12', name: 'cancellable set drifts: Approved removed (03-B)', file: RULES,
    edits: [["export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed'] as const;",
      "export const CANCELLABLE_STATUSES = ['Submitted', 'Planning', 'Confirmed'] as const;"]],
    suites: both },
  { id: 'M13', name: 'compare-and-set made unconditional (03-C) (equivalent: the cancel path reads the event row FOR UPDATE and checks isCancellable before the UPDATE, so the status cannot change in between)', file: CANCEL,
    edits: [['WHERE id = $1 AND status = ANY($4::text[])', 'WHERE id = $1 AND ($4::text[] IS NOT NULL)']],
    suites: both,
    // Equivalent: the row is locked FOR UPDATE and its status is re-checked before this UPDATE, so the
    // conditional WHERE can never match a row the status check let through. The CAS stays as defence in depth.
    equivalent: true },
  { id: 'M14', name: 'release not scoped to the event: every venue booking released (04-B)', file: VENUE,
    edits: [["WHERE event_id = $1 AND status IN ('pending', 'approved')",
      "WHERE ($1::uuid IS NOT NULL) AND status IN ('pending', 'approved')"]],
    suites: both },
  { id: 'M15', name: 'no transaction: each statement commits on its own (04-C)', file: CANCEL,
    edits: [['return this.database.transaction((client) => this.cancelInside(client, user, eventId, now));',
      'return this.cancelInside({ query: (sql: string, params?: unknown[]) => this.database.query(sql, params) } as never, user, eventId, now);']],
    suites: both },
  // RR-136-07 / CQ F5: the recipient notices are one INSERT ... SELECT unnest(...) on the transaction client.
  { id: 'M16', name: 'notices written outside the transaction (04-C)', file: CANCEL,
    edits: [["    await client.query(\n      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, created_at)\n       SELECT gen_random_uuid()",
      "    await this.database.query(\n      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, created_at)\n       SELECT gen_random_uuid()"]],
    suites: both },
  { id: 'M17', name: 'coordinator not notified when the organiser cancels (06-A B)', file: CANCEL,
    edits: [['if (event.coordinator_id) recipients.add(event.coordinator_id);',
      'if (event.coordinator_id && !(user.uid === event.organiser_id)) recipients.add(event.coordinator_id);']],
    suites: both },
  { id: 'M18', name: 'withdrawn attendees notified (06-C)', file: REGISTRATION,
    edits: [["WHERE event_id = $1 AND status = 'Registered' ORDER BY attendee_id",
      "WHERE event_id = $1 AND status IN ('Registered', 'Withdrawn') ORDER BY attendee_id"]],
    suites: both },
  { id: 'M19', name: 'withdrawn rows touched by the release (08-B)', file: REGISTRATION,
    edits: [["SET status = 'Cancelled', cancellation_reason = 'Event cancelled', updated_at = $2\n        WHERE event_id = $1 AND status = 'Registered'",
      "SET status = 'Cancelled', cancellation_reason = 'Event cancelled', updated_at = $2\n        WHERE event_id = $1 AND status IN ('Registered', 'Withdrawn')"]],
    suites: both },
  { id: 'M20', name: 'guard removed from one route: clarification reply (07-A)', file: CLARIFICATIONS,
    edits: [['      const authorRole = this.requireOrganiserOrAssignedCoordinator(event, user);\n      assertEventNotCancelled(event.status);',
      '      const authorRole = this.requireOrganiserOrAssignedCoordinator(event, user);']],
    suites: both },
  { id: 'S1', name: 'guard removed: confirm-no-equipment', file: ST, edits: [strip('  async confirmNoEquipment(identity: AuthenticatedUser | undefined, eventId: string) {\n')], suites: both },
  { id: 'S2', name: 'guard removed: safety-check request', file: ST, edits: [strip('  async requestSafetyCheck(identity: AuthenticatedUser | undefined, eventId: string) {\n')], suites: both },
  { id: 'S3', name: 'guard removed: equipment request removal', file: ST, edits: [strip('  async removeEquipmentRequest(identity: AuthenticatedUser | undefined, eventId: string, equipmentReservationId: string) {\n')], suites: both },
  { id: 'S4', name: 'guard removed: venue request removal', file: ST, edits: [strip('  async removeVenueRequest(identity: AuthenticatedUser | undefined, eventId: string, venueRequestId: string) {\n')], suites: both },
  { id: 'S5', name: 'guard removed: safety feedback resolve/unresolve', file: ST, edits: [strip('    resolved: boolean,\n  ) {\n')], suites: both },
  { id: 'S6', name: 'guard removed: planning PATCH + flagged-change resolve', file: PL, edits: [['    assertEventNotCancelled(access.event.status);\n', '']], suites: both },
  { id: 'S7', name: 'guard removed: clarification create', file: CL, edits: [['      this.requireAssignedCoordinator(event, user);\n      assertEventNotCancelled(event.status);\n', '      this.requireAssignedCoordinator(event, user);\n']], suites: both },
  { id: 'S8', name: 'guard removed: clarification resolve', file: CL, edits: [['      const resolverRole = this.requireOrganiserOrAssignedCoordinator(event, user);\n      assertEventNotCancelled(event.status);\n', '      const resolverRole = this.requireOrganiserOrAssignedCoordinator(event, user);\n']], suites: both },
  // TR-136-15: S9 re-anchored to the current ternary (the Cancelled-on-cancelled-event branch of withdraw).
  { id: 'S9', name: 'withdraw of a Cancelled registration on a cancelled event gets registration_not_withdrawable, not EVENT_CANCELLED', file: RG,
    edits: [["return { refused: current.event_status === 'Cancelled' ? this.eventCancelledWithdrawal() : this.notWithdrawable() };", 'return { refused: this.notWithdrawable() };']],
    suites: both },
  // TR-136-15: W4 event status ignored; a Cancelled entry always answers EVENT_CANCELLED. Killed by the unit case
  // 'a Cancelled waiting entry on a Confirmed event gives registration_not_withdrawable and no UPDATE' (withdraw spec).
  { id: 'W4', name: 'event status ignored: a Cancelled entry on a live event answers EVENT_CANCELLED (SPM-138 10-F)', file: RG,
    edits: [["return { refused: current.event_status === 'Cancelled' ? this.eventCancelledWithdrawal() : this.notWithdrawable() };", 'return { refused: this.eventCancelledWithdrawal() };']],
    suites: ['unitWithdraw'],
    testMappings: [{ suite: 'unitWithdraw', file: 'src/registrations/withdrawal/registrations.withdraw.spec.ts',
      title: 'a Cancelled waiting entry on a Confirmed event gives registration_not_withdrawable and no UPDATE' }] },
  // TR-136-17: the waiting-list wiring (SPM-138 AC12, waitlist side). Each mutant runs the waitlist e2e file through the
  // suite 'waitlist12' with testMappings to the JOIN-WAITLIST-12 cases that must fail. A survivor is reported as a survivor.
  // W1: the waiting releaser is not registered: no waiting entry is cancelled and no notice is written.
  { id: 'W1', name: 'waitlist releaser not registered in DEFAULT_RELEASERS: waiting entries survive the cancel', file: 'src/events/cancel/release.registry.ts',
    edits: [['  waitlistReleaser,\n', '']], suites: ['waitlist12', 'cancelE2e'], testMappings: [{ suite: 'waitlist12', file: 'test/registrations.waitlist.e2e-spec.ts', title: 'JOIN-WAITLIST-12-A: cancelling the event notifies each waitlisted attendee once' }, { suite: 'waitlist12', file: 'test/registrations.waitlist.e2e-spec.ts', title: 'JOIN-WAITLIST-12-C-REL: the releaser cancels waiting entries only, row by row' }, { suite: 'cancelE2e', file: 'test/events-cancel.e2e-spec.ts', title: 'CANCEL-EVENT-08-A-COMBINED: three Confirmed rows and two waiting entries are Cancelled, and nothing is promoted' }] },
  // W2: the waiting releaser's release is a no-op (registered, but it releases nothing).
  { id: 'W2', name: 'waitlist releaser release is a no-op: waiting entries are not cancelled', file: 'src/registrations/release/waitlist.releaser.ts',
    edits: [['    await releaseWaitlistForCancelledEvent(client, eventId, now);', '    return;']], suites: ['waitlist12', 'cancelE2e'], testMappings: [{ suite: 'waitlist12', file: 'test/registrations.waitlist.e2e-spec.ts', title: 'JOIN-WAITLIST-12-A: cancelling the event notifies each waitlisted attendee once' }, { suite: 'waitlist12', file: 'test/registrations.waitlist.e2e-spec.ts', title: 'JOIN-WAITLIST-12-C-REL: the releaser cancels waiting entries only, row by row' }, { suite: 'cancelE2e', file: 'test/events-cancel.e2e-spec.ts', title: 'CANCEL-EVENT-08-A-COMBINED: three Confirmed rows and two waiting entries are Cancelled, and nothing is promoted' }] },
  // W6: the waiting notice INSERT is dropped (entries are cancelled, nobody is told).
  { id: 'W6', name: 'waitlist EventCancelled notice not written for each cancelled entry', file: 'src/registrations/waitlist/cancel-releaser.ts',
    edits: [['  for (const row of cancelled.rows) {', '  for (const row of [] as { attendee_id: string }[]) {']], suites: ['waitlist12'], testMappings: [{ suite: 'waitlist12', file: 'test/registrations.waitlist.e2e-spec.ts', title: 'JOIN-WAITLIST-12-A: cancelling the event notifies each waitlisted attendee once' }, { suite: 'waitlist12', file: 'test/registrations.waitlist.e2e-spec.ts', title: 'JOIN-WAITLIST-12-C-REL: the releaser cancels waiting entries only, row by row' }] },
  // W7 (dedupe): the ON CONFLICT on the waiting notice is removed. EQUIVALENT: the join refuses the event's organiser and
  // assigned coordinator (W8), so no recipient of the waiting notice is also a recipient of the core notice, and the
  // once-only index is never hit by this INSERT. The ON CONFLICT stays as a defence; nothing reachable depends on it.
  { id: 'W7', name: 'waitlist notice without ON CONFLICT (equivalent: no reachable overlap with the core recipients)', file: 'src/registrations/waitlist/cancel-releaser.ts', equivalent: true,
    edits: [["\n       ON CONFLICT (recipient_id, related_event_id, type) WHERE type = 'EventCancelled' DO NOTHING`,", '`,']], suites: ['waitlist12'] },
  // W8: the organiser and assigned-coordinator refusal in the waiting-list join is removed (SPM-136 rule).
  { id: 'W8', name: 'waiting-list join allows the event organiser or assigned coordinator (SPM-136 rule)', file: 'src/registrations/registrations.service.ts',
    edits: [['      if (attendee.uid === event.organiser_id || attendee.uid === event.coordinator_id)\n', '      if (false)\n']], suites: ['waitlist12'], testMappings: [{ suite: 'waitlist12', file: 'test/registrations.waitlist.e2e-spec.ts', title: 'JOIN-WAITLIST-12-D-COO-REFUSED: the assigned coordinator cannot join the waiting list of their own event' }, { suite: 'waitlist12', file: 'test/registrations.waitlist.e2e-spec.ts', title: 'JOIN-WAITLIST-12-D-ORG-REFUSED: the organiser cannot join the waiting list of their own event' }] },
  { id: 'S10', name: 'invalid-transition 422 for Cancelled removed', file: ST, edits: [["    if (event.status === 'Cancelled' && targetStatus !== 'Confirmed')", '    if (false)']], suites: both },
  { id: 'S11', name: 'holds (pending) not released', file: VE, edits: [["status IN ('pending', 'approved')", "status IN ('approved')"]], suites: both },
  { id: 'S12', name: 'only Reserved equipment released (Requested/Unavailable kept)', file: EQ, edits: [["status IN ('Requested', 'Reserved', 'Unavailable')", "status IN ('Reserved')"]], suites: both },
  { id: 'S13', name: 'Requested equipment lines not released', file: EQ, edits: [["status IN ('Requested', 'Reserved', 'Unavailable')", "status IN ('Reserved', 'Unavailable')"]], suites: both },
  { id: 'S14', name: 'registration cancellation_reason not set', file: RE, edits: [["cancellation_reason = 'Event cancelled'", 'cancellation_reason = NULL']], suites: both },
  { id: 'S15', name: "EventCancelled missing from coordinator notification types", file: "src/events/events.service.ts", suites: ['unit', 'e2e'],
    edits: [["'coordinator_unassignment',\n            'EventCancelled',","'coordinator_unassignment',"]] },
  { id: 'S16', name: "EventCancelled missing from organiser notification types", file: "src/events/events.service.ts", suites: ['unit', 'e2e'],
    edits: [["'EventConfirmed',\n            'EventCancelled',","'EventConfirmed',"]] },
  { id: 'S17', name: 'canceller excluded from recipients', file: CA, edits: [['    const message = CANCEL_MESSAGES.cancelled(updated.rows[0].event_name);', '    recipients.delete(user.uid);\n    const message = CANCEL_MESSAGES.cancelled(updated.rows[0].event_name);']], suites: both },
  { id: 'S18', name: 'history from_status hard-coded Confirmed', file: CA, edits: [['[randomUUID(), eventId, event.status, user.uid, now],', "[randomUUID(), eventId, 'Confirmed', user.uid, now],"]], suites: both },
  { id: 'S19', name: 'cancel dispatch after coordinator-only assignedEventOrThrow', file: ST, edits: [["    if (targetStatus === 'Cancelled') return this.cancellation.cancel(identity, eventId, body);\n    const user = this.requireUser(identity);\n    const event = await this.assignedEventOrThrow(user, eventId);\n", "    const user = this.requireUser(identity);\n    const event = await this.assignedEventOrThrow(user, eventId);\n    if (targetStatus === 'Cancelled') return this.cancellation.cancel(identity, eventId, body);\n"]], suites: both },
  { id: 'S20', name: 'Registered attendees not notified', file: RE, edits: [['    return result.rows.map((row) => row.attendee_id);', '    return [];']], suites: both },
  { id: 'S21', name: 'Rejected is cancellable', file: RU, edits: [["'Planning', 'Confirmed'] as const", "'Planning', 'Confirmed', 'Rejected'] as const"]], suites: both },
  { id: 'S22', name: 'Submitted not cancellable', file: RU, edits: [["['Submitted', 'Approved', 'Planning', 'Confirmed']", "['Approved', 'Planning', 'Confirmed']"]], suites: both },
  { id: 'S23', name: 'guard compares lower-case status (never fires)', file: GU, edits: [["if (status === 'Cancelled')", "if (status === 'cancelled')"]], suites: both },
  { id: 'S24', name: 'coordinator not notified (any canceller)', file: CA, edits: [['    if (event.coordinator_id) recipients.add(event.coordinator_id);\n', '']], suites: both },
  // RR-136-01: the venue summary of a cancelled event must not count released bookings.
  { id: 'M22', name: 'venue summary counts released bookings (RR-136-01)', file: 'src/events/venue-summary.ts',
    edits: [["WHERE b.event_id = events.id AND b.status <> 'released') AS venue_summary", 'WHERE b.event_id = events.id) AS venue_summary']],
    suites: both },
  // RR-136-02: readiness must not report a released booking as an outstanding venue item.
  { id: 'M23', name: "readiness reports a released booking as outstanding (RR-136-02)", file: "src/events/status/readiness.ts", suites: ['unit', 'e2e', 'unitReleasedVenue'],
    edits: [["booking.status !== 'released' && booking.status !== 'cancelled',","booking.status !== 'cancelled',"]] },
  // RR-136-02: the planning checklist leaves released bookings out.
  { id: 'M24', name: "checklist keeps released bookings (RR-136-02)", file: "src/events/status/checklist.ts", suites: ['unit', 'e2e', 'unitReleasedVenue'],
    edits: [["(b) => b.status !== 'released' && b.status !== 'cancelled',","(b) => b.status !== 'cancelled',"]] },
  // RR-136-05 / CQ F1: the EventCancelled audience label is derived from the event's organiser, not the coordinator.
  { id: 'M25', name: 'audience derivation joins coordinator_id as the organiser (RR-136-05)', file: 'src/events/events.service.ts',
    edits: [['e.organiser_id AS event_organiser_id', 'e.coordinator_id AS event_organiser_id']],
    suites: both },
  // RR-136-07: the equipment removal re-checks the cancelled status on the locked row (not only the pre-check).
  { id: 'M26', name: 'equipment removal lacks the locked-row cancelled check (RR-136-07)', file: ST,
    edits: [["      assertEventNotCancelled(locked.status);\n      this.assertPlanning(locked.status);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const reservation",
      "      this.assertPlanning(locked.status);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const reservation"]],
    suites: both },
  // RR-136-07: the venue request removal re-checks the cancelled status on the locked row.
  { id: 'M27', name: 'venue request removal lacks the locked-row cancelled check (RR-136-07)', file: ST,
    edits: [["      assertEventNotCancelled(locked.status);\n      this.assertPlanning(locked.status);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const booking",
      "      this.assertPlanning(locked.status);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const booking"]],
    suites: both },
  // TR-136-12: the locked-row status re-checks of the four arrangement mutations (RR-136-07 family). Each one is
  // killed only by a unit test that makes the pre-transaction read Planning and the locked read differ.
  { id: 'B1', name: 'confirm-no-equipment lacks the locked-row cancelled check (TR-136-12)', file: ST,
    edits: [['      assertEventNotCancelled(row.status);\n      this.assertPlanning(row.status);\n      const snapshot = await this.reader.read(client, event.id, { lock: false });',
      '      this.assertPlanning(row.status);\n      const snapshot = await this.reader.read(client, event.id, { lock: false });']],
    suites: both },
  { id: 'B2', name: 'safety-check request lacks the locked-row cancelled check (TR-136-12)', file: ST,
    edits: [['      assertEventNotCancelled(row.status);\n      this.assertPlanning(row.status);\n\n      const snapshot',
      '      this.assertPlanning(row.status);\n\n      const snapshot']],
    suites: both },
  { id: 'B3', name: 'equipment request removal lacks the locked-row Planning check (TR-136-12)', file: ST,
    edits: [['      this.assertPlanning(locked.status);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const reservation',
      '      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const reservation']],
    suites: both },
  { id: 'B4', name: 'venue request removal lacks the locked-row Planning check (TR-136-12)', file: ST,
    edits: [['      this.assertPlanning(locked.status);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const booking',
      '      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const booking']],
    suites: both },
  // ---- SPM-136 test-quality pass (none-identified rows strengthened; BND and INT tests, Guide 5E). Each mutant names
  // the test that must go red against it, through testMappings (an exact test title or a describe title in the file).
  // Cancellation rules: the confirmation and the cancellable set.
  { id: 'R1', name: 'confirmation never accepted (02-C accepts confirmed: true)', file: RU, suites: ['unitCancelRules'],
    edits: [['  return (body as { confirmed?: unknown }).confirmed === true;', '  return false;']],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-02-C: accepts confirmed: true' }] },
  { id: 'R3', name: 'only false is refused: omitted, empty object and null confirm (02-C refusal rows)', file: RU, suites: ['unitCancelRules'],
    edits: [['  return (body as { confirmed?: unknown }).confirmed === true;', '  return (body as { confirmed?: unknown }).confirmed !== false;']],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-02-C: refuses confirmation' }] },
  { id: 'R4', name: 'confirmation by loose equality: the string "1" and the number 1 confirm (02-C BND-2)', file: RU, suites: ['unitCancelRules'],
    edits: [['  return (body as { confirmed?: unknown }).confirmed === true;', '  return (body as { confirmed?: unknown }).confirmed == true;']],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-02-C-BND-2' }] },
  { id: 'R5', name: 'any non-empty string confirms: the string "false" confirms (02-C BND-1)', file: RU, suites: ['unitCancelRules'],
    edits: [['  return (body as { confirmed?: unknown }).confirmed === true;', "  return (body as { confirmed?: unknown }).confirmed === true || (typeof (body as { confirmed?: unknown }).confirmed === 'string' && (body as { confirmed?: unknown }).confirmed !== '');"]],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-02-C-BND-1' }] },
  { id: 'R6', name: 'any boolean confirms: false is accepted (02-C false row)', file: RU, suites: ['unitCancelRules'],
    edits: [['  return (body as { confirmed?: unknown }).confirmed === true;', "  return typeof (body as { confirmed?: unknown }).confirmed === 'boolean';"]],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-02-C: refuses confirmation' }] },
  { id: 'R8', name: 'missing-body guard removed: no body throws instead of refusing (02-C no-body row)', file: RU, suites: ['unitCancelRules'],
    edits: [["  if (!body || typeof body !== 'object') return false;\n", '']],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-02-C: refuses confirmation' }] },
  { id: 'S30', name: 'Planning dropped from the cancellable set (03-B Planning row)', file: RU, suites: ['unitCancelRules'],
    edits: [["export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed'] as const;", "export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Confirmed'] as const;"]],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-03-B: the cancellable set' }] },
  { id: 'S31', name: 'Confirmed dropped from the cancellable set (03-B Confirmed row)', file: RU, suites: ['unitCancelRules'],
    edits: [["export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed'] as const;", "export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Planning'] as const;"]],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-03-B: the cancellable set' }] },
  { id: 'S32', name: 'Cancelled added to the cancellable set (03-B Cancelled row)', file: RU, suites: ['unitCancelRules'],
    edits: [["export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed'] as const;", "export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed', 'Cancelled'] as const;"]],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-03-B: the cancellable set' }] },
  { id: 'S33', name: 'status compared without regard to case (03-B lower-case rows)', file: RU, suites: ['unitCancelRules'],
    edits: [['  return (CANCELLABLE_STATUSES as readonly string[]).includes(status);', '  return (CANCELLABLE_STATUSES as readonly string[]).some((s) => s.toLowerCase() === status.toLowerCase());']],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-03-B: the cancellable set' }] },
  { id: 'S34', name: 'deny-list instead of allow-list: unknown statuses are cancellable (03-B "" and "Under Review")', file: RU, suites: ['unitCancelRules'],
    edits: [['  return (CANCELLABLE_STATUSES as readonly string[]).includes(status);', "  return !['Completed', 'Rejected', 'Cancelled'].includes(status);"]],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-03-B: the cancellable set' }] },
  { id: 'S35', name: 'Draft added to the cancellable set, one step before Submitted (03-B BND-1)', file: RU, suites: ['unitCancelRules'],
    edits: [["export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed'] as const;", "export const CANCELLABLE_STATUSES = ['Draft', 'Submitted', 'Approved', 'Planning', 'Confirmed'] as const;"]],
    testMappings: [{ suite: 'unitCancelRules', file: 'src/events/cancel/cancel-rules.spec.ts', title: 'CANCEL-EVENT-03-B-BND-1' }] },
  // Cancel service: the authentication, format and existence checks, and the order of the confirmation and status checks.
  { id: 'C1', name: 'no-identity check removed: an anonymous request is not refused 401 (01-C no identity)', file: CA, suites: ['unitCancelService'],
    edits: [["    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');", "    if (false) throw new UnauthorizedException('Authentication required.');"]],
    testMappings: [{ suite: 'unitCancelService', file: 'src/events/cancel/cancel-event.service.spec.ts', title: 'CANCEL-EVENT-01-C: no identity is refused with 401' }] },
  { id: 'C2', name: 'event id format check removed: a malformed id reaches the database (01-C malformed id)', file: CA, suites: ['unitCancelService'],
    edits: [['    if (!UUID_PATTERN.test(eventId)) throw new NotFoundException(CANCEL_MESSAGES.notFound);', '    if (false) throw new NotFoundException(CANCEL_MESSAGES.notFound);']],
    testMappings: [{ suite: 'unitCancelService', file: 'src/events/cancel/cancel-event.service.spec.ts', title: 'CANCEL-EVENT-01-C: a malformed event id is 404' }] },
  { id: 'C3', name: 'missing-event check removed before the ownership check (01-C unknown id)', file: CA, suites: ['unitCancelService'],
    edits: [['    const event = await this.findEvent(eventId);\n    if (!event) throw new NotFoundException(CANCEL_MESSAGES.notFound);', '    const event = await this.findEvent(eventId);']],
    testMappings: [{ suite: 'unitCancelService', file: 'src/events/cancel/cancel-event.service.spec.ts', title: 'CANCEL-EVENT-01-C: an unknown event id (well-formed) is 404' }] },
  { id: 'I2', name: 'status check placed before the confirmation check (02-C INT-2: a Completed event gives 409, not 400)', file: CA, suites: ['unitCancelService'],
    edits: [['    if (!isConfirmed(body))', '    if (!isCancellable(event.status)) throw this.notCancellable();\n    if (!isConfirmed(body))']],
    testMappings: [{ suite: 'unitCancelService', file: 'src/events/cancel/cancel-event.service.spec.ts', title: 'CANCEL-EVENT-02-C-INT-2' }] },
  // Status service: the cancelled guard against the assignment check (INT-1), the pre-lock Planning check (INT-3), and the
  // locked-row Planning check of the confirm-no-equipment and safety-check requests (B5, B6).
  { id: 'I1', name: 'cancelled guard placed before the assignment check (01-C INT-1: an outsider gets 409, not 403)', file: ST, suites: ['unitStatusRemoval'],
    edits: [['  async confirmNoEquipment(identity: AuthenticatedUser | undefined, eventId: string) {\n    const user = this.requireUser(identity);\n    const event = await this.assignedEventOrThrow(user, eventId);\n',
      '  async confirmNoEquipment(identity: AuthenticatedUser | undefined, eventId: string) {\n    const user = this.requireUser(identity);\n    const early = await this.findEvent(eventId);\n    if (early) assertEventNotCancelled(early.status);\n    const event = await this.assignedEventOrThrow(user, eventId);\n']],
    testMappings: [{ suite: 'unitStatusRemoval', file: 'src/events/status/status.removal.spec.ts', title: 'CANCEL-EVENT-01-C-INT-1' }] },
  { id: 'I3', name: 'pre-lock Planning check removed from confirm-no-equipment (07-A INT-3: the lock is taken for a refused request)', file: ST, suites: ['unitStatusRemoval'],
    edits: [['  async confirmNoEquipment(identity: AuthenticatedUser | undefined, eventId: string) {\n    const user = this.requireUser(identity);\n    const event = await this.assignedEventOrThrow(user, eventId);\n    assertEventNotCancelled(event.status);\n    this.assertPlanning(event.status);\n',
      '  async confirmNoEquipment(identity: AuthenticatedUser | undefined, eventId: string) {\n    const user = this.requireUser(identity);\n    const event = await this.assignedEventOrThrow(user, eventId);\n    assertEventNotCancelled(event.status);\n']],
    testMappings: [{ suite: 'unitStatusRemoval', file: 'src/events/status/status.removal.spec.ts', title: 'CANCEL-EVENT-07-A-INT-3' }] },
  { id: 'B5', name: 'confirm-no-equipment lacks the locked-row Planning check (TR-136-12, Confirmed under the lock)', file: ST, suites: ['unitStatusRemoval'],
    edits: [['      assertEventNotCancelled(row.status);\n      this.assertPlanning(row.status);\n      const snapshot = await this.reader.read(client, event.id, { lock: false });', '      assertEventNotCancelled(row.status);\n      const snapshot = await this.reader.read(client, event.id, { lock: false });']],
    testMappings: [{ suite: 'unitStatusRemoval', file: 'src/events/status/status.removal.spec.ts', title: 'confirm-no-equipment on a row that is Confirmed under the lock is refused 422' }] },
  { id: 'B6', name: 'safety-check request lacks the locked-row Planning check (TR-136-12, Confirmed under the lock)', file: ST, suites: ['unitStatusRemoval'],
    edits: [['      assertEventNotCancelled(row.status);\n      this.assertPlanning(row.status);\n\n      const snapshot', '      assertEventNotCancelled(row.status);\n\n      const snapshot']],
    testMappings: [{ suite: 'unitStatusRemoval', file: 'src/events/status/status.removal.spec.ts', title: 'a safety-check request on a row that is Confirmed under the lock is refused 422' }] },
  // Notifications: the audience label of the EventCancelled notice (06-A organiser, coordinator, attendee and dual-role rows).
  { id: 'N1', name: 'organiser copy labelled as the attendee copy (06-A organiser row)', file: EV, suites: ['unitNotifications'],
    edits: [["    if (row.event_organiser_id === row.recipient_id) return 'organiser';", "    if (row.event_organiser_id === row.recipient_id) return 'attendee';"]],
    testMappings: [{ suite: 'unitNotifications', file: 'src/events/cancelled-notifications.spec.ts', title: 'CANCEL-EVENT-06-A: the organiser who submitted the event reads the organiser copy' }] },
  { id: 'N2', name: 'coordinator copy labelled as the attendee copy (06-A coordinator row)', file: EV, suites: ['unitNotifications'],
    edits: [["    if (row.event_coordinator_id === row.recipient_id) return 'coordinator';", "    if (row.event_coordinator_id === row.recipient_id) return 'attendee';"]],
    testMappings: [{ suite: 'unitNotifications', file: 'src/events/cancelled-notifications.spec.ts', title: 'CANCEL-EVENT-06-A: the assigned coordinator reads the coordinator copy' }] },
  { id: 'N3', name: 'attendee copy labelled as the organiser copy (06-A-ATT row)', file: EV, suites: ['unitNotifications'],
    edits: [["    return 'attendee';\n  }\n  if (row.type === 'coordinator_unavailable')", "    return 'organiser';\n  }\n  if (row.type === 'coordinator_unavailable')"]],
    testMappings: [{ suite: 'unitNotifications', file: 'src/events/cancelled-notifications.spec.ts', title: 'a Waitlisted attendee who is neither organiser nor coordinator reads the attendee copy' }] },
  { id: 'N4', name: 'audience label taken from the reader roles: an ORGANISER role reads the organiser copy (06-A-DUAL, RR-136-05)', file: EV, suites: ['unitNotifications'],
    edits: [['      audienceRole: audienceRoleFor({', "      audienceRole: user.roles.includes('ORGANISER') && row.type === 'EventCancelled' ? 'organiser' : audienceRoleFor({"]],
    testMappings: [{ suite: 'unitNotifications', file: 'src/events/cancelled-notifications.spec.ts', title: 'RR-136-05: a user holding BOTH roles who is only the assigned coordinator of the event reads the coordinator copy' }] },
  // Equipment release (05-B): the equipment release must stay scoped to the cancelled event. Killed by the e2e file, so this
  // mutant only runs in a full run (see docs/specs/SPM-136-test-results.md, the e2e baseline caveat).
  { id: 'E1', name: 'equipment release not scoped to the cancelled event: another event reservation is released (05-B)', file: EQ, suites: ['cancelE2e'],
    edits: [["WHERE event_id = $1 AND status IN ('Requested', 'Reserved', 'Unavailable')", "WHERE ($1::uuid IS NOT NULL) AND status IN ('Requested', 'Reserved', 'Unavailable')"]],
    testMappings: [{ suite: 'cancelE2e', file: 'test/events-cancel.e2e-spec.ts', title: 'CANCEL-EVENT-05-B: EQ-308 stays Reserved x1 after EVT-301 is cancelled' }] },
  { id: 'RR1', name: "the cancellation skips the waiting-list releaser (CANCEL-EVENT-04-C-REG)", file: "src/events/cancel/release.registry.ts", suites: ['unit', 'e2e', 'unitRelease'],
    edits: [["  waitlistReleaser,\n",""]] },
  { id: 'REG1', name: "the registration releaser collects Withdrawn rather than Registered attendees as recipients (CANCEL-EVENT-08-A)", file: "src/registrations/release/registration.releaser.ts", suites: ['unit', 'e2e', 'unitRelease'],
    edits: [["WHERE event_id = $1 AND status = 'Registered' ORDER BY attendee_id","WHERE event_id = $1 AND status = 'Withdrawn' ORDER BY attendee_id"]] },
  { id: 'REG2', name: "the registration releaser does not cancel Registered rows (CANCEL-EVENT-08-A)", file: "src/registrations/release/registration.releaser.ts", suites: ['unit', 'e2e', 'unitRelease'],
    edits: [["SET status = 'Cancelled', cancellation_reason = 'Event cancelled', updated_at = $2\n        WHERE event_id = $1 AND status = 'Registered'","SET status = 'Cancelled', cancellation_reason = 'Event cancelled', updated_at = $2\n        WHERE event_id = $1 AND status = 'Withdrawn'"]] },
  { id: 'EQ1', name: "the equipment releaser leaves Unavailable lines reserved (CANCEL-EVENT-05-A)", file: "src/equipment/release/equipment-reservation.releaser.ts", suites: ['unit', 'e2e', 'unitRelease'],
    edits: [["AND status IN ('Requested', 'Reserved', 'Unavailable')","AND status IN ('Requested', 'Reserved')"]] },
  { id: 'VB1', name: "the venue releaser leaves pending holds in place (CANCEL-EVENT-04-A)", file: "src/venues/release/venue-booking.releaser.ts", suites: ['unit', 'e2e', 'unitRelease'],
    edits: [["AND status IN ('pending', 'approved')","AND status IN ('approved')"]] },
  { id: 'GD1', name: "the cancelled-event guard never refuses (CANCEL-EVENT-07-A)", file: "src/events/cancelled-guard.ts", suites: ['unit', 'e2e', 'unitGuard'],
    edits: [["if (status === 'Cancelled')\n","if (status === 'Cancelled' && false)\n"]] },
];
