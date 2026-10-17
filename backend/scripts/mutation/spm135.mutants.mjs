// SPM-135 backend mutants (Confirm an Event), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm135.mutants.mjs            # every mutant (needs DATABASE_URL)
//   node scripts/mutation/run.mjs --mutants spm135.mutants.mjs --only M7,M-HOLD-EQ
// Each edit is [from, to]; `from` must occur exactly once in the file (run.mjs reports MISAPPLIED otherwise).
// The runner mutates a scratch copy, never the repository tree.
//
// IDs M1 to M18 and M7b to M9c follow docs/specs/SPM-135-test-results.md. Extra mutants cover the
// reader's overlap SQL (R*), the hold-expiry boundary (M-HOLD-EQ), the non-Planning branch (NP*),
// the organiser allowlist guards (CA*) and the GET assignment check (GET*).
// CK* mutate the planning checklist (checklist.ts, unit suite), SF* the stored-status mapping
// (safety-check.source.ts, safetyUnit and confirmRealSafety), VS* the venue text SQL (venue-summary.ts,
// venueSummary suite), and RV*/EQ* the venue and equipment removal endpoints (status.service.ts, removal suite).
// CHA* mutate the confirm-no-equipment and request-safety-check actions and the status-change input guard
// (status.service.ts, checklistActions suite).
//
// M19 (the Confirm button not disabled while pending) is a FRONTEND mutant. It cannot be run from this
// backend runner because run.mjs copies only the backend tree. It is documented in
// docs/specs/SPM-135-test-results.md and must be run from a frontend runner.
//
// The venue_bookings and equipment_reservations safety-reset triggers (database/postgresql/init 014 and 016)
// are NOT in this runner. run.mjs edits only backend/ files. Their mutants (TG*) are in
// spm135.triggers.mutants.mjs and run through run-triggers.mjs, which builds a fresh scratch database per
// mutant from copies of the init scripts and drops it afterwards. Those mutants never touch the shared
// spm_test database.
//
// `equivalent: true` is a claim that the survivor cannot change observable behaviour through the routes.
// Each claim is explained in its name; the runner reports any non-equivalent survivor and exits 1.
export const SUITES = {
  // Pure rule specs: the readiness function (fail-closed table, hold boundary, ordering) and the planning checklist.
  unit: {
    args: ['run', 'src/events/status/readiness.spec.ts', 'src/events/status/checklist.spec.ts'],
  },
  // Pure FACT_STATE mapping of the stored safety check status (safety-check.source.ts).
  safetyUnit: {
    args: ['run', 'src/events/status/safety-check.source.spec.ts'],
  },
  // PostgreSQL integration suite; needs DATABASE_URL with database/postgresql/init 001 to 012 applied.
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-confirm.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
  // Confirm gate against the real safety source (no SAFETY_OUTCOME_SOURCE override).
  confirmRealSafety: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-confirm-safety-source.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
  // Venue and equipment removal through HTTP (removeVenueRequest / removeEquipmentRequest).
  removal: {
    args: [
      'run', '--config', './vitest.config.e2e.ts',
      'test/events-venue-removal.e2e-spec.ts', 'test/events-equipment-removal.e2e-spec.ts',
    ],
    needsEnv: ['DATABASE_URL'],
  },
  // confirm-no-equipment, request-safety-check and the status-change input guard through HTTP.
  checklistActions: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-checklist-actions.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
  // The venue text SQL (venue-summary.ts) through GET /api/events and GET /api/events/:id.
  venueSummary: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-venue-summary.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const READER = 'src/events/status/arrangements.reader.ts';
const READINESS = 'src/events/status/readiness.ts';
const SERVICE = 'src/events/status/status.service.ts';
const CHECKLIST = 'src/events/status/checklist.ts';
const SAFETY = 'src/events/status/safety-check.source.ts';
const VENUE_SUMMARY = 'src/events/venue-summary.ts';
const both = ['unit', 'e2e'];
const e2eOnly = ['e2e'];
const unitOnly = ['unit'];
const removalOnly = ['removal'];
const summaryOnly = ['venueSummary'];
const actionsOnly = ['checklistActions'];
const safetySource = ['safetyUnit', 'confirmRealSafety'];

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
      ['    const result: ReadinessResult = evaluateReadiness(\n      { ...snapshot, safety: await this.safety.read(eventId) },\n      now,\n    );\n', '    const result: ReadinessResult = evaluateReadiness(\n      { ...snapshot, safety: await this.safety.read(eventId) },\n      now,\n    );\n    pageLoadCache.set(eventId, result);\n'],
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
    edits: [["'SELECT id, status, event_name, organiser_id, coordinator_id FROM events WHERE id = $1 FOR UPDATE',", "'SELECT id, status, event_name, organiser_id, coordinator_id FROM events WHERE id = $1',"], ["WHERE id = $1 AND status = 'Planning'", 'WHERE id = $1']],
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

  // ---- checklist.ts: per-request statuses and the combined section status (SPM-135 planning checklist) ----
  { id: 'CK1', name: 'approved booking shown confirmed even when its venue is blocked for the window', file: CHECKLIST,
    edits: [["if (booking.status === 'approved') return booking.venueUnavailable ? 'unavailable' : 'confirmed';", "if (booking.status === 'approved') return 'confirmed';"]],
    suites: unitOnly },
  { id: 'CK2', name: 'rejected booking shown pending instead of unavailable', file: CHECKLIST,
    edits: [["if (booking.status === 'rejected') return 'unavailable';", "if (booking.status === 'rejected') return 'pending';"]],
    suites: unitOnly },
  { id: 'CK3', name: 'pending booking shown confirmed', file: CHECKLIST,
    edits: [["  if (booking.status === 'approved') return booking.venueUnavailable ? 'unavailable' : 'confirmed';\n  return 'pending';", "  if (booking.status === 'approved') return booking.venueUnavailable ? 'unavailable' : 'confirmed';\n  return 'confirmed';"]],
    suites: unitOnly },
  { id: 'CK4', name: 'pending beats unavailable in the combined venue status', file: CHECKLIST,
    edits: [["  if (statuses.includes('unavailable')) return 'unavailable';\n  if (statuses.includes('pending')) return 'pending';", "  if (statuses.includes('pending')) return 'pending';\n  if (statuses.includes('unavailable')) return 'unavailable';"]],
    suites: unitOnly },
  { id: 'CK5', name: 'pending ignored when another request is confirmed (section ticked with a pending request)', file: CHECKLIST,
    edits: [["  if (statuses.includes('pending')) return 'pending';", "  if (statuses.includes('pending') && statuses.includes('unavailable')) return 'pending';"]],
    suites: unitOnly },
  { id: 'CK6', name: 'equipment Requested shown confirmed', file: CHECKLIST,
    edits: [["return line.status === 'Reserved' ? 'confirmed' : 'pending';", "return 'confirmed';"]],
    suites: unitOnly },
  { id: 'CK7', name: 'unavailable equipment line shown pending instead of unavailable', file: CHECKLIST,
    edits: [["if (UNAVAILABLE_EQUIPMENT.has(line.status.toLowerCase())) return 'unavailable';", "if (UNAVAILABLE_EQUIPMENT.has(line.status.toLowerCase())) return 'pending';"]],
    suites: unitOnly },
  { id: 'CK8', name: 'Released equipment lines counted as outstanding', file: CHECKLIST,
    edits: [["const INACTIVE = new Set(['Cancelled', 'Released']);", "const INACTIVE = new Set(['Cancelled']);"]],
    suites: unitOnly },
  { id: 'CK9', name: 'no-equipment section satisfied without the coordinator confirmation', file: CHECKLIST,
    edits: [['  const noneConfirmed = lines.length === 0 && equipmentConfirmedAt !== null;', '  const noneConfirmed = lines.length === 0;']],
    suites: unitOnly },
  { id: 'CK10', name: 'safety check shown while a prerequisite is still blocking', file: CHECKLIST,
    edits: [["safetyCheck: blocking.length === 0 || safety.status === 'not_requested' ? safety : { status: 'not_requested' },", 'safetyCheck: safety,']],
    suites: unitOnly },
  { id: 'CK11', name: 'safety check request allowed while a prerequisite is blocking', file: CHECKLIST,
    edits: [['    canRequestSafetyCheck: blocking.length === 0,', '    canRequestSafetyCheck: true,']],
    suites: unitOnly },
  { id: 'CK12', name: 'the text "None" treated as an equipment requirement', file: CHECKLIST,
    edits: [["return text !== '' && text !== 'none';", "return text !== '';"]],
    suites: unitOnly },
  { id: 'CK13', name: 'equipment section confirmed by statuses alone (no-equipment confirmation ignored)', file: CHECKLIST,
    edits: [['  const equipmentConfirmed = equipmentStatus === \'confirmed\' || noneConfirmed;', "  const equipmentConfirmed = equipmentStatus === 'confirmed';"]],
    suites: unitOnly },
  { id: 'CK14', name: 'a pending venue request does not block the safety check', file: CHECKLIST,
    edits: [["if (venueStatus !== 'confirmed') blocking.push('venue');", "if (venueStatus === 'unavailable') blocking.push('venue');"]],
    suites: unitOnly },
  { id: 'CK15', name: 'no venue request shown as confirmed', file: CHECKLIST,
    edits: [["    bookings.length === 0 ? 'not_requested' : combined(venueItems.map((item) => item.status));", "    bookings.length === 0 ? 'confirmed' : combined(venueItems.map((item) => item.status));"]],
    suites: unitOnly },

  // ---- safety-check.source.ts: FACT_STATE, the stored status to the readiness state ----
  { id: 'SF1', name: 'pending safety check mapped to Approved (clears the Confirm gate)', file: SAFETY,
    edits: [["  pending: 'Awaiting Check',", "  pending: 'Approved',"]], suites: safetySource },
  { id: 'SF2', name: 'changes_needed safety check mapped to Approved', file: SAFETY,
    edits: [["  changes_needed: 'Changes Requested',", "  changes_needed: 'Approved',"]], suites: safetySource },
  { id: 'SF3', name: 'approved safety check mapped to Awaiting Check', file: SAFETY,
    edits: [["  approved: 'Approved',", "  approved: 'Awaiting Check',"]], suites: safetySource },
  { id: 'SF4', name: 'pending and changes_needed swapped', file: SAFETY,
    edits: [["  pending: 'Awaiting Check',\n  changes_needed: 'Changes Requested',", "  pending: 'Changes Requested',\n  changes_needed: 'Awaiting Check',"]], suites: safetySource },

  // ---- venue-summary.ts: the venue text SQL (labels, window overlap, joining) ----
  { id: 'VS1', name: 'approved unblocked booking labelled unavailable', file: VENUE_SUMMARY,
    edits: [["WHEN b.status = 'approved' AND NOT EXISTS (", "WHEN b.status = 'approved' AND EXISTS ("]], suites: summaryOnly },
  { id: 'VS2', name: 'a window block at another venue flags this venue', file: VENUE_SUMMARY,
    edits: [['WHERE u.venue_id = b.venue_id AND u.event_id IS NULL', 'WHERE u.event_id IS NULL']], suites: summaryOnly },
  { id: 'VS3', name: 'pending label reads unavailable', file: VENUE_SUMMARY,
    edits: [["WHEN b.status = 'pending' THEN v.name || ' (pending)'", "WHEN b.status = 'pending' THEN v.name || ' (unavailable)'"]], suites: summaryOnly },
  { id: 'VS4', name: 'rejected booking labelled pending', file: VENUE_SUMMARY,
    edits: [["      ELSE v.name || ' (unavailable)'", "      ELSE v.name || ' (pending)'"]], suites: summaryOnly },
  { id: 'VS5', name: 'blocked status literal changed (window block never recognised)', file: VENUE_SUMMARY,
    edits: [["AND u.status = 'blocked'", "AND u.status = 'rejected'"]], suites: summaryOnly },
  { id: 'VS6', name: 'window start bound inclusive (a block starting when the slot ends is flagged)', file: VENUE_SUMMARY,
    edits: [['AND u.start_at < b.end_at', 'AND u.start_at <= b.end_at']], suites: summaryOnly },
  { id: 'VS7', name: 'window end bound inclusive (a block ending when the slot starts is flagged)', file: VENUE_SUMMARY,
    edits: [['AND u.end_at > b.start_at', 'AND u.end_at >= b.start_at']], suites: summaryOnly },
  { id: 'VS8', name: 'venue names joined with "; " instead of ", "', file: VENUE_SUMMARY,
    edits: [["    END, ', ' ORDER BY b.start_at)", "    END, '; ' ORDER BY b.start_at)"]], suites: summaryOnly },
  { id: 'VS9', name: 'venue names joined in reverse start order', file: VENUE_SUMMARY,
    edits: [['ORDER BY b.start_at)', 'ORDER BY b.start_at DESC)']], suites: summaryOnly },
  // Overlap predicate forms (venue-summary.ts). The true overlap is "block starts before the booking ends AND
  // block ends after the booking starts". Each replacement below is a plausible wrong predicate; the partial-
  // overlap tests (block 01:00-03:00 and 03:00-05:00 against 02:00-04:00) kill the equality and containment forms.
  { id: 'VS10', name: 'overlap predicate equality-only (a block must match the booking start and end exactly)', file: VENUE_SUMMARY,
    edits: [['AND u.start_at < b.end_at AND u.end_at > b.start_at)', 'AND u.start_at = b.start_at AND u.end_at = b.end_at)']], suites: summaryOnly },
  { id: 'VS11', name: 'overlap predicate containment-only (the block must fully contain the booking)', file: VENUE_SUMMARY,
    edits: [['AND u.start_at < b.end_at AND u.end_at > b.start_at)', 'AND u.start_at <= b.start_at AND u.end_at >= b.end_at)']], suites: summaryOnly },
  { id: 'VS12', name: 'overlap predicate containment-only (the booking must fully contain the block)', file: VENUE_SUMMARY,
    edits: [['AND u.start_at < b.end_at AND u.end_at > b.start_at)', 'AND u.start_at >= b.start_at AND u.end_at <= b.end_at)']], suites: summaryOnly },

  // ---- status.service.ts: venue and equipment removal (VENUE-REMOVE, EQUIPMENT-REMOVE, 409/404/403/422) ----
  { id: 'RV1', name: 'any venue request removable (confirmed one can be deleted)', file: SERVICE,
    edits: [["const unavailable = booking.status === 'rejected' || booking.venueUnavailable;", 'const unavailable = true;']], suites: removalOnly },
  { id: 'RV2', name: 'rejected venue request not removable', file: SERVICE,
    edits: [["const unavailable = booking.status === 'rejected' || booking.venueUnavailable;", 'const unavailable = booking.venueUnavailable;']], suites: removalOnly },
  { id: 'RV3', name: 'window-blocked venue request not removable (only rejected is)', file: SERVICE,
    edits: [["const unavailable = booking.status === 'rejected' || booking.venueUnavailable;", "const unavailable = booking.status === 'rejected';"]], suites: removalOnly },
  { id: 'RV4', name: 'unknown venue request not reported as 404', file: SERVICE,
    edits: [['      if (!booking)\n        throw new NotFoundException', '      if (false)\n        throw new NotFoundException']], suites: removalOnly },
  { id: 'RV5', name: 'venue removal allowed on an event that is not in Planning', file: SERVICE,
    edits: [["    this.assertPlanning(event.status);\n    return this.database.transaction(async (client) => {\n      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const booking",
      "    return this.database.transaction(async (client) => {\n      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const booking"]],
    suites: removalOnly },
  { id: 'RV6', name: 'venue removal without the assignment check (any coordinator can remove)', file: SERVICE,
    edits: [["    const event = await this.assignedEventOrThrow(user, eventId);\n    this.assertPlanning(event.status);\n    return this.database.transaction(async (client) => {\n      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const booking",
      "    const event = (await this.findEvent(eventId))!;\n    this.assertPlanning(event.status);\n    return this.database.transaction(async (client) => {\n      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const booking"]],
    suites: removalOnly },
  { id: 'RV7', name: 'venue delete not scoped to the event (equivalent: the lookup above already restricts the id to this event under the row lock)', file: SERVICE, equivalent: true,
    edits: [["DELETE FROM venue_bookings WHERE id = $1 AND event_id = $2', [venueRequestId, event.id]", "DELETE FROM venue_bookings WHERE id = $1', [venueRequestId]"]],
    suites: removalOnly },
  { id: 'EQ1', name: 'any equipment request removable (a reserved line can be deleted)', file: SERVICE,
    edits: [["const unavailable = ['unavailable', 'rejected'].includes(reservation.status.toLowerCase());", 'const unavailable = true;']], suites: removalOnly },
  { id: 'EQ2', name: 'unavailable equipment request not removable (status compared case-sensitively)', file: SERVICE,
    edits: [["const unavailable = ['unavailable', 'rejected'].includes(reservation.status.toLowerCase());", "const unavailable = ['unavailable', 'rejected'].includes(reservation.status);"]], suites: removalOnly },
  { id: 'EQ3', name: 'unknown equipment request not reported as 404', file: SERVICE,
    edits: [['      if (!reservation)\n        throw new NotFoundException', '      if (false)\n        throw new NotFoundException']], suites: removalOnly },
  { id: 'EQ4', name: 'equipment removal allowed on an event that is not in Planning', file: SERVICE,
    edits: [["    this.assertPlanning(event.status);\n    return this.database.transaction(async (client) => {\n      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const reservation",
      "    return this.database.transaction(async (client) => {\n      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const reservation"]],
    suites: removalOnly },
  { id: 'EQ5', name: 'equipment removal without the assignment check (any coordinator can remove)', file: SERVICE,
    edits: [["    const event = await this.assignedEventOrThrow(user, eventId);\n    this.assertPlanning(event.status);\n    return this.database.transaction(async (client) => {\n      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const reservation",
      "    const event = (await this.findEvent(eventId))!;\n    this.assertPlanning(event.status);\n    return this.database.transaction(async (client) => {\n      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);\n      const snapshot = await this.reader.read(client, event.id, { lock: true });\n      const reservation"]],
    suites: removalOnly },
  { id: 'EQ6', name: 'a Requested equipment line removable', file: SERVICE,
    edits: [["const unavailable = ['unavailable', 'rejected'].includes(reservation.status.toLowerCase());", "const unavailable = ['unavailable', 'rejected', 'requested'].includes(reservation.status.toLowerCase());"]], suites: removalOnly },
  { id: 'EQ7', name: 'rejected equipment status no longer counted as unavailable (equivalent: equipment_reservations.status CHECK allows only Requested, Reserved, Unavailable, Cancelled, Released)', file: SERVICE, equivalent: true,
    edits: [["const unavailable = ['unavailable', 'rejected'].includes(reservation.status.toLowerCase());", "const unavailable = ['unavailable'].includes(reservation.status.toLowerCase());"]], suites: removalOnly },

  // ---- status.service.ts: checklist actions and the status-change input guard (CHECKLIST-ACTION-01 to 07) ----
  { id: 'CHA1', name: 'confirm-no-equipment accepted for an event that lists equipment', file: SERVICE,
    edits: [["if (checklist.equipment.required || checklist.equipment.status !== 'not_requested')", 'if (false)']], suites: actionsOnly },
  { id: 'CHA2', name: 'confirm-no-equipment overwrites the stored time on every call', file: SERVICE,
    edits: [['if (!row.equipment_confirmed_at)', 'if (true)']], suites: actionsOnly },
  { id: 'CHA3', name: 'safety check requestable before venue and equipment are confirmed', file: SERVICE,
    edits: [['if (!checklist.canRequestSafetyCheck)', 'if (false)']], suites: actionsOnly },
  { id: 'CHA4', name: 'a pending safety check can be requested again', file: SERVICE,
    edits: [["if (current?.status === 'pending')", 'if (false)']], suites: actionsOnly },
  { id: 'CHA5', name: 'an approved safety check can be requested again', file: SERVICE,
    edits: [["if (current?.status === 'approved')", 'if (false)']], suites: actionsOnly },
  { id: 'CHA6', name: 'a malformed event id reaches the database', file: SERVICE,
    edits: [['if (!UUID_PATTERN.test(eventId)) return undefined;', '']], suites: actionsOnly },
  { id: 'CHA7', name: 'a non-string targetStatus is treated as Confirmed', file: SERVICE,
    edits: [["return typeof value === 'string' ? value : '';", "return typeof value === 'string' ? value : 'Confirmed';"]], suites: actionsOnly },
];
