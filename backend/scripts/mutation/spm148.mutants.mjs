// SPM-148 backend mutants (Approved to Planning), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm148.mutants.mjs             # every mutant (needs DATABASE_URL)
//   node scripts/mutation/run.mjs --mutants spm148.mutants.mjs --only M6,M8
// Each edit is [from, to]; `from` must occur exactly once in the file (run.mjs reports MISAPPLIED otherwise).
// The runner mutates a scratch copy, never the repository tree.
//
// IDs follow the SPM-148 prompt's mutant table (M1 to M24) and docs/specs/SPM-148-test-results.md.
// M12 (the status filter ignored on the events list) is a FRONTEND mutant and cannot run from this
// backend runner; see docs/specs/SPM-148-test-results.md.
// M8 (automatic revert) is synthetic: the repository has no revert path, so the edit adds one.
// M23 (multi-venue) has no code path and is not listed.
export const SUITES = {
  // PostgreSQL integration suites for the SPM-148 behaviour. Needs DATABASE_URL and the init scripts.
  planningE2e: {
    args: [
      'run', '--config', './vitest.config.e2e.ts',
      'test/events-planning-transition.e2e-spec.ts', 'test/clarifications.e2e-spec.ts',
      'test/lead-assignment.e2e-spec.ts', 'test/venues-booking-requests.e2e-spec.ts',
    ],
    needsEnv: ['DATABASE_URL'],
  },
  // Pure rule specs and the repository's SQL-routed unit cases.
  planningUnit: {
    args: [
      'run', 'src/events/types/event-status.spec.ts', 'src/venues/availability/dto/booking-request.spec.ts',
      'src/venues/repository/venues.repository.spec.ts', 'src/clarifications/clarifications.service.spec.ts',
    ],
  },
};

const REPO = 'src/venues/repository/venues.repository.ts';
const STATUS_RULE = 'src/events/types/event-status.ts';
const suites = ['planningE2e', 'planningUnit'];

export const MUTANTS = [
  { id: 'M1', name: 'unconditional transition: no status guard, no compare-and-set', file: REPO,
    edits: [
      ['    if (!shouldTransitionToPlanning(status)) return false;\n', ''],
      ["WHERE id = $1::uuid AND status = 'Approved'", 'WHERE id = $1::uuid'],
    ], suites },
  { id: 'M2', name: 'transition also fires from Confirmed', file: STATUS_RULE,
    edits: [["return status === 'Approved';", "return status === 'Approved' || status === 'Confirmed';"]],
    suites: ['planningE2e', 'planningUnit'] },
  { id: 'M3', name: 'status changed before the request is validated (before the conflict check)', file: REPO,
    edits: [
      ['event-linked pending booking requests also block below.\n      const conflict = await client.query<{ reason: string }>(',
        'event-linked pending booking requests also block below.\n      await this.moveToPlanning(client, input.eventId, coordinatorId, eventRow.status);\n      const conflict = await client.query<{ reason: string }>('],
      ['const statusChanged = await this.moveToPlanning(', 'const statusChanged = false && await this.moveToPlanning('],
    ], suites },
  { id: 'M4', name: 'booking and status change in separate transactions (row locks dropped)', file: REPO,
    edits: [
      ["FROM venues v WHERE v.id = $1::uuid FOR UPDATE`", "FROM venues v WHERE v.id = $1::uuid`"],
      ["coordinator_id = $2::text FOR UPDATE`,\n        [input.eventId, coordinatorId],\n      );\n      const eventRow = event.rows[0];\n      if (!eventRow) return { kind: 'event-not-assigned' };", "coordinator_id = $2::text`,\n        [input.eventId, coordinatorId],\n      );\n      const eventRow = event.rows[0];\n      if (!eventRow) return { kind: 'event-not-assigned' };"],
      ["// SPM-148 PLAN-STATUS-02-A, 02-C: the booking row, written in the same transaction as the status change and history row.\n      const saved = await client.query<{\n        id: string;\n        start_at: Date;\n        end_at: Date;\n      }>(",
        "// SPM-148 PLAN-STATUS-02-A, 02-C: the booking row, written in the same transaction as the status change and history row.\n      const saved = await client.query<{\n        id: string;\n        start_at: Date;\n        end_at: Date;\n      }>(".replace('const saved = await client.query<{', 'const saved = await this.database.transaction((c2) => c2.query<{')],
      ['          input.specialRequest ?? null,\n        ],\n      );\n      const row = saved.rows[0];',
        '          input.specialRequest ?? null,\n        ],\n      ));\n      const row = saved.rows[0];'],
      ['const statusChanged = await this.moveToPlanning(\n        client,',
        'const statusChanged = await this.database.transaction((c3) => this.moveToPlanning(\n        c3,'],
      ['        eventRow.status,\n      );\n      return {', '        eventRow.status,\n      ));\n      return {'],
    ], suites },
  { id: 'M5', name: 'history row never written', file: REPO,
    edits: [['    await client.query(\n      `INSERT INTO event_status_history', '    if (false) await client.query(\n      `INSERT INTO event_status_history']],
    suites },
  { id: 'M6', name: 'no compare-and-set and no event row lock (parallel first requests both transition)', file: REPO,
    edits: [
      ["WHERE id = $1::uuid AND status = 'Approved'", 'WHERE id = $1::uuid'],
      ["coordinator_id = $2::text FOR UPDATE`,\n        [input.eventId, coordinatorId],\n      );\n      const eventRow = event.rows[0];\n      if (!eventRow) return { kind: 'event-not-assigned' };", "coordinator_id = $2::text`,\n        [input.eventId, coordinatorId],\n      );\n      const eventRow = event.rows[0];\n      if (!eventRow) return { kind: 'event-not-assigned' };"],
    ], suites },
  { id: 'M7', name: 'later requests add a history row', file: REPO,
    edits: [
      ['    if (!shouldTransitionToPlanning(status)) return false;\n', ''],
      ['    if (moved.rowCount !== 1) return false;\n', ''],
    ], suites },
  { id: 'M8', name: 'automatic revert to Approved when no active booking remains (synthetic)', file: REPO,
    edits: [[
      '      const event = await client.query<{\n        id: string;\n        status: string;\n        expected_attendance: number;',
      "      await client.query(`UPDATE events SET status = 'Approved' WHERE id = $1::uuid AND status = 'Planning' AND NOT EXISTS (SELECT 1 FROM venue_bookings WHERE event_id = $1::uuid AND status IN ('pending','approved'))`, [input.eventId]);\n      const event = await client.query<{\n        id: string;\n        status: string;\n        expected_attendance: number;",
    ]], suites },
  { id: 'M9', name: 'unknown request fields accepted (client can send status, changedBy, changedAt)', file: 'src/venues/availability/dto/booking-request.ts',
    edits: [['if (Object.keys(input).some((key) => !BOOKING_FIELDS.includes(key)))', 'if (false as boolean)']], suites },
  { id: 'M10', name: 'changedAt from database now() instead of the injected clock', file: REPO,
    edits: [
      ["'Approved', 'Planning', $3::text, $4::timestamptz)", "'Approved', 'Planning', $3::text, now())"],
      ['[randomUUID(), eventId, actorId, now],', '[randomUUID(), eventId, actorId],'],
    ], suites },
  { id: 'M11', name: 'history editable: PUT answers 200', file: 'src/events/status/status.controller.ts',
    edits: [['.status(405)', '.status(200)']], suites },
  { id: 'M13', name: 'coordinator events list returns other Coordinators events', file: 'src/events/events.service.ts',
    edits: [['FROM events WHERE coordinator_id = $1 ORDER BY start_date_time ASC', 'FROM events WHERE coordinator_id = $1 OR TRUE ORDER BY start_date_time ASC']], suites: ['planningE2e'] },
  { id: 'M14', name: 'Planning missing from the workload list', file: STATUS_RULE,
    edits: [["export const ACTIVE_WORKLOAD_STATUSES = [\n  'Submitted',\n  'Approved',\n  'Planning',", "export const ACTIVE_WORKLOAD_STATUSES = [\n  'Submitted',\n  'Approved',"]], suites },
  { id: 'M15', name: 'active count double counts Planning events', file: 'src/lead/lead-assignment.service.ts',
    edits: [
      ['(SELECT COUNT(*) FROM events\n', '((SELECT COUNT(*) FROM events\n'],
      ['AND events.status IN (${statuses}))::text AS active_assignments',
        "AND events.status IN (${statuses})) + (SELECT COUNT(*) FROM events e2 WHERE e2.coordinator_id = users.id::text AND e2.status = 'Planning'))::text AS active_assignments"],
    ], suites },
  { id: 'M16', name: 'Lead list and availability use an old (pre-Planning) status list', file: 'src/lead/lead-assignment.service.ts',
    edits: [['const ACTIVE_STATUSES = ACTIVE_WORKLOAD_STATUSES;', "const ACTIVE_STATUSES = ['Submitted', 'Approved', 'Confirmed'] as const;"]], suites },
  { id: 'M17', name: 'clarifications blocked while Planning', file: STATUS_RULE,
    edits: [["export const CLARIFICATION_OPEN_STATUSES = [\n  'Submitted',\n  'Approved',\n  'Planning',", "export const CLARIFICATION_OPEN_STATUSES = [\n  'Submitted',\n  'Approved',"]], suites },
  { id: 'M18', name: 'clarifications still allowed after Confirmed', file: 'src/clarifications/clarifications.service.ts',
    edits: [
      ['      this.requireNotConfirmed(event);\n      if (!(CLARIFICATION_OPEN_STATUSES', '      if (!(CLARIFICATION_OPEN_STATUSES'],
      ["assertEventNotCancelled(event.status);\n      this.requireNotConfirmed(event);\n\n      const clarification", "assertEventNotCancelled(event.status);\n\n      const clarification"],
    ], suites },
  { id: 'M19', name: 'organiser role gate removed on clarification replies', file: 'src/clarifications/clarifications.service.ts',
    edits: [["): 'organiser' | 'coordinator' {\n    const isOrganiser = user.roles.includes('ORGANISER') && event.organiser_id === user.uid;", "): 'organiser' | 'coordinator' {\n    const isOrganiser = user.roles.includes('ORGANISER');"]], suites },
  { id: 'M20', name: 'status accepted from the request body (strict check relaxed for status only)', file: 'src/venues/availability/dto/booking-request.ts',
    edits: [
      ["const BOOKING_FIELDS = ['eventId', 'start', 'end', 'specialRequest'];", "const BOOKING_FIELDS = ['eventId', 'start', 'end', 'specialRequest', 'status'];"],
    ], suites },
  { id: 'M21', name: 'public status-change endpoint accepts Planning', file: 'src/events/status/status.service.ts',
    edits: [["if (targetStatus !== 'Confirmed')", "if (targetStatus !== 'Confirmed' && targetStatus !== 'Planning')"]], suites },
  { id: 'M22', name: 'organiser may submit the booking request', file: 'src/venues/venues.service.ts',
    edits: [["no token gets 401.\n    if (!identity.roles.includes('COORDINATOR'))", "no token gets 401.\n    if (!identity.roles.includes('COORDINATOR') && !identity.roles.includes('ORGANISER'))"]], suites },
  { id: 'M24', name: 'confirm accepts Approved', file: 'src/events/status/status.service.ts',
    edits: [["    if (status === 'Planning') return;", "    if (status === 'Planning' || status === 'Approved') return;"]], suites },
];
