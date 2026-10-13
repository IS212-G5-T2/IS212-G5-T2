// SPM-135 backend mutants (Confirm an Event), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm135.mutants.mjs            # every mutant (needs DATABASE_URL)
//   node scripts/mutation/run.mjs --mutants spm135.mutants.mjs --only M7,M-HOLD-EQ
// Each edit is [from, to]; `from` must occur exactly once in the file (run.mjs reports MISAPPLIED otherwise).
// The runner mutates a scratch copy, never the repository tree.
//
// IDs M1 to M18 and M7b to M9c follow docs/specs/SPM-135-test-results.md. Extra mutants cover the
// reader's overlap SQL (R*), the hold-expiry boundary (M-HOLD-EQ), the non-Planning branch (NP*),
// the organiser allowlist guards (CA*) and the GET assignment check (GET*).
//
// M19 (the Confirm button not disabled while pending) is a FRONTEND mutant. It cannot be run from this
// backend runner because run.mjs copies only the backend tree. It is documented in
// docs/specs/SPM-135-test-results.md and must be run from a frontend runner.
//
// `equivalent: true` is a claim that the survivor cannot change observable behaviour through the routes.
// Each claim is explained in its name; the runner reports any non-equivalent survivor and exits 1.
export const SUITES = {
  // Pure rule spec for the readiness function (fail-closed table, hold boundary, ordering).
  unit: {
    args: ['run', 'src/events/status/readiness.spec.ts'],
  },
  // PostgreSQL integration suite; needs DATABASE_URL with database/postgresql/init 001 to 012 applied.
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-confirm.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const READER = 'src/events/status/arrangements.reader.ts';
const READINESS = 'src/events/status/readiness.ts';
const SERVICE = 'src/events/status/status.service.ts';
const both = ['unit', 'e2e'];
const e2eOnly = ['e2e'];

const ASSIGNED = "const isAssigned = user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid;";
const LOCK_RECHECK = 'if (current.coordinator_id !== identity.uid)';

export const MUTANTS = [
  // ---- readiness.ts (pure rule; also reached over HTTP) ----
  { id: 'M1', name: 'only the first venue booking is checked (kills 02-C rule; 01-B)', file: READINESS,
    edits: [['for (const booking of [...snapshot.venueBookings].sort(byId)) {', 'for (const booking of [...snapshot.venueBookings].sort(byId).slice(0, 1)) {']],
    suites: both },
  { id: 'M2', name: 'equipment Requested treated as Reserved', file: READINESS,
    edits: [["if (INACTIVE_EQUIPMENT.has(line.status) || line.status === 'Reserved') return undefined;", "if (INACTIVE_EQUIPMENT.has(line.status) || line.status === 'Reserved' || line.status === 'Requested') return undefined;"]],
    suites: both },
  { id: 'M3', name: 'safety Changes Requested treated as approved', file: READINESS,
    edits: [["if (safety?.state === 'Approved') return undefined;", "if (safety?.state === 'Approved' || safety?.state === 'Changes Requested') return undefined;"]],
    suites: both },
  { id: 'M4', name: 'safety Awaiting Check treated as approved', file: READINESS,
    edits: [["if (safety?.state === 'Approved') return undefined;", "if (safety?.state === 'Approved' || safety?.state === 'Awaiting Check') return undefined;"]],
    suites: both },
  { id: 'M16', name: 'satisfied (Reserved) equipment listed as outstanding', file: READINESS,
    edits: [["if (INACTIVE_EQUIPMENT.has(line.status) || line.status === 'Reserved') return undefined;", 'if (INACTIVE_EQUIPMENT.has(line.status)) return undefined;']],
    suites: both },
  { id: 'M17', name: 'venue-unavailable flag ignored for approved bookings', file: READINESS,
    edits: [['if (!booking.venueUnavailable) return undefined;', 'return undefined;']],
    suites: both },
  { id: 'M18', name: 'zero venue bookings treated as ready (vacuous approval)', file: READINESS,
    edits: [['if (snapshot.venueBookings.length === 0) {', 'if (false) {']],
    suites: both },
  { id: 'M-HOLD-EQ', name: 'hold-expiry boundary `<=` changed to `<` (a hold expiring exactly now stays live)', file: READINESS,
    edits: [['const expired = booking.holdExpiresAt.getTime() <= now.getTime();', 'const expired = booking.holdExpiresAt.getTime() < now.getTime();']],
    suites: both },

  // ---- arrangements.reader.ts (overlap SQL for the venue-unavailable flag, D10) ----
  { id: 'R1', name: 'overlap ignores the venue (any venue blocked flags the booking)', file: READER,
    edits: [['u.venue_id = b.venue_id', 'TRUE']], suites: e2eOnly },
  { id: 'R2', name: 'overlap start bound inclusive (a block starting when the slot ends is flagged)', file: READER,
    edits: [['AND u.start_at < b.end_at', 'AND u.start_at <= b.end_at']], suites: e2eOnly },
  { id: 'R3', name: 'overlap end bound inclusive (a block ending when the slot starts is flagged)', file: READER,
    edits: [['AND u.end_at > b.start_at', 'AND u.end_at >= b.start_at']], suites: e2eOnly },
  { id: 'R4', name: 'blocked status literal changed (venue-unavailable never recognised)', file: READER,
    edits: [["AND u.status = 'blocked'", "AND u.status = 'rejected'"]], suites: e2eOnly },
  // Equivalent: venue_bookings_kind_check (001_schema.sql, migration 009) forces a blocked row to have event_id NULL.
  { id: 'R5', name: 'event_id IS NULL dropped (equivalent: the kind CHECK constraint already forces a blocked row to have no event)', file: READER, equivalent: true,
    edits: [['AND u.event_id IS NULL', 'AND TRUE']], suites: e2eOnly },

  // ---- status.service.ts: assignment (POST pre-check, POST locked re-check, GET path) ----
  { id: 'M7', name: 'assignment removed in assignedEventOrThrow (shared by POST and GET arrangements-status)', file: SERVICE,
    edits: [[ASSIGNED, 'const isAssigned = true;']], suites: both },
  { id: 'M7b', name: 'assignment removed at the locked re-check only (equivalent: the pre-check refuses first; a reassignment race is not reproducible in the suite)', file: SERVICE, equivalent: true,
    edits: [[LOCK_RECHECK, 'if (false)']], suites: both },
  { id: 'M7c', name: 'assignment removed at both sites', file: SERVICE,
    edits: [[ASSIGNED, 'const isAssigned = true;'], [LOCK_RECHECK, 'if (false)']], suites: both },
  { id: 'M8', name: 'Lead allowed in assignedEventOrThrow (shared by POST and GET arrangements-status)', file: SERVICE,
    edits: [[ASSIGNED, "const isAssigned = user.roles.includes('COORDINATOR_LEAD') || (user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid);"]],
    suites: both },
  { id: 'M8b', name: 'Lead allowed at the locked re-check only (equivalent: the pre-check refuses first)', file: SERVICE, equivalent: true,
    edits: [[LOCK_RECHECK, "if (!identity.roles.includes('COORDINATOR_LEAD') && current.coordinator_id !== identity.uid)"]], suites: both },
  { id: 'M8c', name: 'Lead allowed at both sites', file: SERVICE,
    edits: [[ASSIGNED, "const isAssigned = user.roles.includes('COORDINATOR_LEAD') || (user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid);"],
      [LOCK_RECHECK, "if (!identity.roles.includes('COORDINATOR_LEAD') && current.coordinator_id !== identity.uid)"]],
    suites: both },
  { id: 'M9', name: 'Organiser allowed in assignedEventOrThrow (shared by POST and GET arrangements-status)', file: SERVICE,
    edits: [[ASSIGNED, "const isAssigned = user.roles.includes('ORGANISER') || (user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid);"]],
    suites: both },
  { id: 'M9b', name: 'Organiser allowed at the locked re-check only (equivalent: the pre-check refuses first)', file: SERVICE, equivalent: true,
    edits: [[LOCK_RECHECK, "if (!identity.roles.includes('ORGANISER') && current.coordinator_id !== identity.uid)"]], suites: both },
  { id: 'M9c', name: 'Organiser allowed at both sites', file: SERVICE,
    edits: [[ASSIGNED, "const isAssigned = user.roles.includes('ORGANISER') || (user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid);"],
      [LOCK_RECHECK, "if (!identity.roles.includes('ORGANISER') && current.coordinator_id !== identity.uid)"]],
    suites: both },
  { id: 'GET1', name: 'GET arrangements-status skips the assignment check (readiness shown to anyone who can name the event)', file: SERVICE,
    edits: [['    await this.assignedEventOrThrow(user, eventId);\n    const now = this.clock.now();', '    await this.findEvent(eventId);\n    const now = this.clock.now();']],
    suites: both },

  // ---- status.service.ts: source status guards (D5) ----
  { id: 'M5', name: 'server-side readiness check removed (confirm ignores outstanding items)', file: SERVICE,
    edits: [['if (!result.ready) this.throwBlocked(result);', 'void result;']], suites: both },
  { id: 'M6', name: 'readiness taken from a page-load snapshot (cache filled by GET, reused by confirm)', file: SERVICE,
    edits: [
      ['@Injectable()\nexport class StatusService', 'const pageLoadCache = new Map<string, ReadinessResult>();\n\n@Injectable()\nexport class StatusService'],
      ['    return { eventId, ready: result.ready, outstanding: result.outstanding };', '    pageLoadCache.set(eventId, result);\n    return { eventId, ready: result.ready, outstanding: result.outstanding };'],
      ['    const result = evaluateReadiness({ ...snapshot, safety: await this.safety.read(event.id) }, now);', '    const result = pageLoadCache.get(event.id) ?? evaluateReadiness({ ...snapshot, safety: await this.safety.read(event.id) }, now);'],
    ],
    suites: e2eOnly },
  { id: 'M10', name: 'Rejected and Cancelled guard removed (they fall through to the generic refusal)', file: SERVICE,
    edits: [["if (status === 'Rejected' || status === 'Cancelled')", 'if (false)']], suites: e2eOnly },
  { id: 'NP1', name: 'non-Planning source falls through instead of being refused (Approved/Submitted)', file: SERVICE,
    edits: [["    throw new UnprocessableEntityException({\n      code: STATUS_CODES.notConfirmable,\n      message: STATUS_MESSAGES.notPlanning,\n    });", '    return;']],
    suites: e2eOnly },
  { id: 'NP2', name: 'Approved accepted as a source status', file: SERVICE,
    edits: [["if (status === 'Planning') return;", "if (status === 'Planning' || status === 'Approved') return;"]], suites: e2eOnly },
  { id: 'M11', name: 'unconditional UPDATE under the row lock (equivalent: the status is re-read under FOR UPDATE)', file: SERVICE, equivalent: true,
    edits: [["WHERE id = $1 AND status = 'Planning'", 'WHERE id = $1']], suites: e2eOnly },
  { id: 'M11c', name: 'no row lock and unconditional UPDATE (kills 04-B deterministic)', file: SERVICE,
    edits: [["WHERE id = $1 FOR UPDATE',", "WHERE id = $1',"], ["WHERE id = $1 AND status = 'Planning'", 'WHERE id = $1']],
    suites: e2eOnly },

  // ---- status.service.ts: side effects (history, notification, organiser allowlist) ----
  { id: 'M12', name: 'a notification written before the guards', file: SERVICE,
    edits: [['    this.assertSourceStatus(current.status);', "    await client.query(\"INSERT INTO notifications (id, recipient_id, type, message, related_event_id, created_at) VALUES (gen_random_uuid(), $1, 'EventConfirmed', 'early', $2, now())\", [current.organiser_id, event.id]);\n    this.assertSourceStatus(current.status);"]],
    suites: e2eOnly },
  { id: 'M13', name: 'EventConfirmed notification sent to the coordinator (wrong recipient)', file: SERVICE,
    edits: [['updated.rows[0].organiser_id,', 'identity.uid,']], suites: e2eOnly },
  { id: 'M14', name: 'the event row spread into the organiser response', file: SERVICE,
    edits: [["    return {\n      eventId,\n      status: 'Confirmed',\n      venueBookings", "    return {\n      ...event,\n      eventId,\n      status: 'Confirmed',\n      venueBookings"]],
    suites: e2eOnly },
  { id: 'M15', name: 'history actor is the organiser instead of the coordinator', file: SERVICE,
    edits: [['[randomUUID(), event.id, identity.uid, now],', '[randomUUID(), event.id, event.organiser_id, now],']], suites: e2eOnly },
  { id: 'CA1', name: 'organiser role check removed from confirmedArrangements (a coordinator reaches the 404 path, not 403)', file: SERVICE,
    edits: [["if (!user.roles.includes('ORGANISER')) throw new ForbiddenException('Organiser access required.');", 'void user;']],
    suites: e2eOnly },
  { id: 'CA2', name: 'submitting-organiser check removed from confirmedArrangements (any organiser reads a Confirmed event)', file: SERVICE,
    edits: [['if (!event || event.organiser_id !== user.uid) throw new NotFoundException(STATUS_MESSAGES.notFound);', 'if (!event) throw new NotFoundException(STATUS_MESSAGES.notFound);']],
    suites: e2eOnly },
  { id: 'CA3', name: 'Confirmed-status check removed from confirmedArrangements (owner reads a Planning event)', file: SERVICE,
    edits: [["if (event.status !== 'Confirmed') throw new NotFoundException(STATUS_MESSAGES.notFound);", 'void event;']],
    suites: e2eOnly },
];
