// SPM-136 backend mutants (Cancel an Event and Release its Reservations), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm136.mutants.mjs            # every mutant (needs DATABASE_URL)
//   node scripts/mutation/run.mjs --mutants spm136.mutants.mjs --only M7,M16
// Each edit is [from, to]; `from` must occur exactly once in the file (run.mjs reports MISAPPLIED otherwise).
// The runner mutates a scratch copy, never the repository tree.
//
// IDs M1 to M20 follow docs/specs/SPM-136-test-results.md (brief list order). M21 (waitlist) is not a code
// mutant: there is no waiting list in this repository (SPM-138), so there is nothing to mutate.
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
  { id: 'M13', name: 'compare-and-set made unconditional (03-C)', file: CANCEL,
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
  { id: 'S9', name: 'withdraw of Cancelled registration falls through to 422', file: RG, edits: [["      if (current.status === 'Cancelled')\n        throw new ConflictException({ code: EVENT_CANCELLED_CODE, message: EVENT_CANCELLED_MESSAGE });\n", '']], suites: both },
  { id: 'S10', name: 'invalid-transition 422 for Cancelled removed', file: ST, edits: [["    if (event.status === 'Cancelled' && targetStatus !== 'Confirmed')", '    if (false)']], suites: both },
  { id: 'S11', name: 'holds (pending) not released', file: VE, edits: [["status IN ('pending', 'approved')", "status IN ('approved')"]], suites: both },
  { id: 'S12', name: 'only Reserved equipment released (Requested/Unavailable kept)', file: EQ, edits: [["status IN ('Requested', 'Reserved', 'Unavailable')", "status IN ('Reserved')"]], suites: both },
  { id: 'S13', name: 'Requested equipment lines not released', file: EQ, edits: [["status IN ('Requested', 'Reserved', 'Unavailable')", "status IN ('Reserved', 'Unavailable')"]], suites: both },
  { id: 'S14', name: 'registration cancellation_reason not set', file: RE, edits: [["cancellation_reason = 'Event cancelled'", 'cancellation_reason = NULL']], suites: both },
  { id: 'S15', name: 'EventCancelled missing from coordinator notification types', file: EV, edits: [["'coordinator_unassignment', 'EventCancelled']", "'coordinator_unassignment']"]], suites: both },
  { id: 'S16', name: 'EventCancelled missing from organiser notification types', file: EV, edits: [["'EventConfirmed', 'EventCancelled']", "'EventConfirmed']"]], suites: both },
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
  { id: 'M23', name: 'readiness reports a released booking as outstanding (RR-136-02)', file: 'src/events/status/readiness.ts',
    edits: [["  if (booking.status === 'released') return undefined;", "  if (booking.status === 'released' && false) return undefined;"]],
    suites: both },
  // RR-136-02: the planning checklist leaves released bookings out.
  { id: 'M24', name: 'checklist keeps released bookings (RR-136-02)', file: 'src/events/status/checklist.ts',
    edits: [["const bookings = snapshot.venueBookings.filter((b) => b.status !== 'released');", 'const bookings = snapshot.venueBookings;']],
    suites: both },
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
];
