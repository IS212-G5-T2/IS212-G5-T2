// SPM-138 backend mutants, run by run.mjs (`node scripts/mutation/run.mjs --mutants spm138.mutants.mjs`).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// The spec's "Kills M#" lines name the mutants but do not define them, so the definitions below were reconstructed from
// those lines (see the SPM-138 results report). Each mutant names the test that must go red.
export const SUITES = {
  // Unit specs for the registrations module, including the waiting list rules and the join rules.
  unit: { args: ['run', 'src/registrations'] },
  // PostgreSQL integration suite for the waiting list; needs DATABASE_URL with database/postgresql/init 001 to 016 and backend/migrations/011 applied.
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/registrations.waitlist.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const SERVICE = 'src/registrations/registrations.service.ts';
const EVENTS = 'src/events/events.service.ts';
const PROMO = 'src/registrations/waitlist/promotion.ts';
const SETTLE = 'src/registrations/waitlist/settle.ts';
const POSITION = 'src/registrations/waitlist/position.ts';
const RELEASER = 'src/registrations/waitlist/cancel-releaser.ts';
const WINDOW = 'src/registrations/registration/registration-window.ts';

// Anchors that are unique to the join (the register path shares most of its text).
const JOIN_LOCK = "    return this.database.transaction(async (client) => {\n      const selected = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [eventId]);";
const JOIN_GUARD_CHECK = "      if (existing.rows[0]?.status === 'Waitlisted') throw this.waitlistDuplicate();\n\n      const taken";
const JOIN_LOST_RACE = '      if (!saved.rows[0]) throw this.waitlistDuplicate();\n';
const JOIN_SETTLE_WINDOW = `      await settleLocked(client, eventId, now);
      const state = registrationWindowState(
        {
          registrationEnabled: event.registration_enabled,
          status: event.status,
          opensAt: event.registration_opens_at ?? null,
          closesAt: event.registration_closes_at ?? null,
        },
        now,
      );
      if (state === 'not_open') throw this.notOpen(event.registration_opens_at);
      if (state === 'closed') throw this.closed();`;
const JOIN_BODY = '    const attendee = this.requireAttendee(identity);\n    this.requireEmptyBody(body);\n    this.requireEventId(eventId);';
const JOIN_ROLE_ANCHOR = '    const attendee = this.requireAttendee(identity);\n    this.requireEmptyBody(body);';
const WITHDRAW_LOOKUP = 'WHERE r.id = $1 AND r.attendee_id = $2';
const REPORT_QUERY = "WHERE event_id = $1 AND status = 'Registered'\n        ORDER BY created_at ASC, id ASC";
const LEAVE_COMMENT = '        // SPM-138: leaving the list releases no place, promotes nobody and sends no notification.';
const PROMOTION_RETURN = '  return promoted;\n}';
const SETTLE_CLOSED_CLAUSE = `        AND (NOT e.registration_enabled
             OR (e.registration_closes_at IS NOT NULL AND $2 >= e.registration_closes_at))`;

const unitRule = (title) => ({ suite: 'unit', file: 'src/registrations/waitlist/waitlist-rules.spec.ts', title });
const unitJoin = (title) => ({ suite: 'unit', file: 'src/registrations/registrations.waitlist.spec.ts', title });
const e2e = (title) => ({ suite: 'e2e', file: 'test/registrations.waitlist.e2e-spec.ts', title });

export const MUTANTS = [
  { id: 'M1', name: 'the join ignores fullness (a join is accepted while places remain)', file: SERVICE,
    edits: [['      if (taken.rows[0].count < event.registration_limit) throw this.waitlistNotAvailable();\n', '']],
    suites: ['unit', 'e2e'], testMappings: [e2e('JOIN-WAITLIST-01-C'), unitJoin('JOIN-WAITLIST-01-C-ERR-UNIT')] },
  { id: 'M2', name: 'a waiting row is reported as registered', file: SERVICE,
    edits: [['status: String(row.status).toLowerCase(),', "status: String(row.status === 'Waitlisted' ? 'Registered' : row.status).toLowerCase(),"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-03-B')] },
  { id: 'M3', name: 'the capacity check is removed from direct registration', file: SERVICE,
    edits: [['      if (taken.rows[0].count >= event.registration_limit)', '      if (false && taken.rows[0].count >= event.registration_limit)']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-01-B-ERR'), e2e('JOIN-WAITLIST-08-D')] },
  { id: 'M4', name: 'the join stores status Registered instead of Waitlisted', file: SERVICE,
    edits: [["SELECT $1::uuid, u.id, 'Waitlisted',", "SELECT $1::uuid, u.id, 'Registered',"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-01-A')] },
  { id: 'M5', name: 'the join skips the closed window check (a full, closed event is joinable)', file: SERVICE,
    edits: [[JOIN_SETTLE_WINDOW, JOIN_SETTLE_WINDOW.replace("      if (state === 'closed') throw this.closed();", '')]],
    suites: ['e2e', 'unit'], testMappings: [e2e('JOIN-WAITLIST-01-D'), unitJoin('JOIN-WAITLIST-01-D-ERR-UNIT')] },
  { id: 'M6', name: 'the join skips the not-yet-open check (the opening instant is not enforced)', file: SERVICE,
    edits: [[JOIN_SETTLE_WINDOW, JOIN_SETTLE_WINDOW.replace("      if (state === 'not_open') throw this.notOpen(event.registration_opens_at);\n", '')]],
    suites: ['e2e', 'unit'], testMappings: [e2e('JOIN-WAITLIST-01-D'), unitJoin('JOIN-WAITLIST-01-D-ERR-UNIT-OPEN')] },
  { id: 'M7', name: 'a duplicate join is accepted: the duplicate check and the lost-race guard are both removed', file: SERVICE,
    edits: [[JOIN_GUARD_CHECK, '\n      const taken'], [JOIN_LOST_RACE, '']],
    suites: ['e2e', 'unit'], testMappings: [e2e('JOIN-WAITLIST-01-E'), unitJoin('JOIN-WAITLIST-01-E-ERR-UNIT')] },
  { id: 'M8', name: 'the attendee role check is removed from the join', file: SERVICE,
    edits: [[JOIN_ROLE_ANCHOR, '    const attendee = identity as AuthenticatedUser;\n    this.requireEmptyBody(body);']],
    suites: ['e2e', 'unit'], testMappings: [e2e('JOIN-WAITLIST-01-F'), unitJoin('JOIN-WAITLIST-01-F-ERR-UNIT')] },
  { id: 'M9', name: 'positions run newest first', file: POSITION,
    edits: [['AND (o.joined_at, o.waitlist_seq) < (r.joined_at, r.waitlist_seq)', 'AND (o.joined_at, o.waitlist_seq) > (r.joined_at, r.waitlist_seq)']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-07-A')] },
  { id: 'M10', name: 'the position tie-break uses the row id instead of waitlist_seq', file: POSITION,
    edits: [['AND (o.joined_at, o.waitlist_seq) < (r.joined_at, r.waitlist_seq)', 'AND (o.joined_at, o.id) < (r.joined_at, r.id)']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-07-B')] },
  { id: 'M11', name: 'a rejoin keeps the old join time and sequence (it does not go to the back)', file: SERVICE,
    edits: [['joined_at = EXCLUDED.joined_at, waitlist_seq = EXCLUDED.waitlist_seq,', 'joined_at = event_registrations.joined_at, waitlist_seq = event_registrations.waitlist_seq,']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-07-C')] },
  { id: 'M12', name: 'the position counts withdrawn and removed entries as ahead of the others', file: POSITION,
    edits: [["o.event_id = r.event_id AND o.status = 'Waitlisted'", "o.event_id = r.event_id AND o.status <> 'Registered'"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-06-A')] },
  { id: 'M13', name: 'the join takes no event row lock, so parallel joins read the same count', file: SERVICE,
    edits: [[JOIN_LOCK, JOIN_LOCK.replace(' FOR UPDATE', '')]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-04-C')] },
  { id: 'M14', name: 'the order follows arrival (waitlist_seq) instead of the join time', file: POSITION,
    edits: [['AND (o.joined_at, o.waitlist_seq) < (r.joined_at, r.waitlist_seq)', 'AND o.waitlist_seq < r.waitlist_seq']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-07-A')] },
  { id: 'M15', name: 'the promotion step is never called after a registered withdrawal', file: SERVICE,
    edits: [['      await fillFreeSpots(client, current.event_id, now);\n', '']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-08-A'), e2e('JOIN-WAITLIST-08-D'), e2e('JOIN-WAITLIST-08-E')] },
  { id: 'M16', name: 'promotion takes the latest entry first', file: PROMO,
    edits: [['ORDER BY joined_at, waitlist_seq\n        LIMIT 1', 'ORDER BY joined_at DESC, waitlist_seq DESC\n        LIMIT 1']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-08-B')] },
  { id: 'M17', name: 'promotion ignores capacity and promotes every waiting entry', file: PROMO,
    edits: [['let free = event.rows[0].capacity - taken.rows[0].count;', 'let free = 99;']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-08-B')] },
  { id: 'M18', name: 'a promotion notification is written even when nothing was promoted', file: PROMO,
    edits: [[PROMOTION_RETURN, "  await client.query(\"INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_user_id) VALUES ($1, 'nobody', 'WaitlistPromoted', 'x', $2, NULL)\", [randomUUID(), eventId]);\n" + PROMOTION_RETURN]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-08-C')] },
  { id: 'M19', name: 'promotion runs without settling the list first (a closed entry is promoted)', file: PROMO,
    edits: [['  await settleLocked(client, eventId, now);\n  const event = await client.query', '  const event = await client.query']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-D')] },
  { id: 'M20', name: 'a promotion notification goes to every remaining waiting entry', file: PROMO,
    edits: [[PROMOTION_RETURN, "  await client.query(\"INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_user_id) SELECT gen_random_uuid(), attendee_id::text, 'WaitlistPromoted', 'x', event_id, attendee_id FROM event_registrations WHERE event_id = $1 AND status = 'Waitlisted'\", [eventId]);\n" + PROMOTION_RETURN]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-09-B')] },
  { id: 'M21', name: 'the promotion notification text is wrong (no event name)', file: PROMO,
    edits: [['MESSAGES.waitlistPromoted(event.rows[0].name)', "MESSAGES.waitlistPromoted('an event')"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-09-A')] },
  { id: 'M22', name: 'a waiting withdrawal also withdraws the earliest confirmed row', file: SERVICE,
    edits: [[LEAVE_COMMENT, "        await client.query(\"UPDATE event_registrations SET status = 'Withdrawn', withdrawn_at = $2, updated_at = $2 WHERE id = (SELECT id FROM event_registrations WHERE event_id = $1 AND status = 'Registered' ORDER BY created_at LIMIT 1)\", [current.event_id, now]);\n" + LEAVE_COMMENT]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-10-D')] },
  { id: 'M23', name: 'the close settle never removes the waiting entries', file: SETTLE,
    edits: [["SET status = 'Removed', removed_at = $2, updated_at = $2", "SET status = 'Waitlisted', removed_at = $2, updated_at = $2"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-A'), e2e('JOIN-WAITLIST-11-B')] },
  { id: 'M24', name: 'the closing instant is inclusive too late (the close is one step late)', file: SETTLE,
    edits: [['${instant} >= e.registration_closes_at))', '${instant} > e.registration_closes_at))']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-B')] },
  { id: 'M25', name: 'a manual close (registration_enabled false) is ignored by the settle', file: SETTLE,
    edits: [['AND (NOT e.registration_enabled\n', 'AND (false\n']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-C')] },
  { id: 'M26', name: 'the cancel releaser also cancels withdrawn entries', file: RELEASER,
    edits: [["WHERE event_id = $1 AND status = 'Waitlisted'", "WHERE event_id = $1 AND status IN ('Waitlisted', 'Withdrawn')"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-12-C-REL')] },
  { id: 'M27', name: 'the SPM-63 report lists waiting entries as well as confirmed ones', file: SERVICE,
    edits: [[REPORT_QUERY, "WHERE event_id = $1 AND status IN ('Registered', 'Waitlisted')\n        ORDER BY created_at ASC, id ASC"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-14-A')] },
  { id: 'M28', name: 'the position is capped at 500', file: POSITION,
    edits: [['SELECT 1 + COUNT(*)::integer FROM event_registrations o', 'SELECT LEAST(500, 1 + COUNT(*))::integer FROM event_registrations o']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-13-A-BND')] },
  { id: 'M29', name: 'the join ignores its body (unknown keys are accepted)', file: SERVICE,
    edits: [[JOIN_BODY, '    const attendee = this.requireAttendee(identity);\n    this.requireEventId(eventId);']],
    suites: ['e2e', 'unit'], testMappings: [e2e('JOIN-WAITLIST-15-A'), unitJoin('JOIN-WAITLIST-15-A-ERR-UNIT')] },
  { id: 'M30', name: 'the by-id lookup drops the owner filter', file: SERVICE,
    edits: [[WITHDRAW_LOOKUP, 'WHERE r.id = $1 AND ($2::uuid IS NOT NULL)']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-05-C'), e2e('JOIN-WAITLIST-10-E')] },
  { id: 'M31', name: 'a position is returned for every entry, not only waiting ones', file: POSITION,
    edits: [["CASE WHEN r.status = 'Waitlisted' THEN (", "CASE WHEN r.status <> 'Zzz' THEN ("]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-05-B')] },
  // ---- TR-1 / TR-4 additions (P-* mutants). Each is killed by the test named in testMappings, except P-G and P-R, which are
  // EQUIVALENT under the event row lock (reviewer-confirmed; SPM-136 must re-run them when it wires the releaser).
  // Writer inventory of event_registrations.status (src, not spec) and the lock each one runs under:
  //   1. register() INSERT ... ON CONFLICT: locks events FOR UPDATE first.
  //   2. joinWaitlist() INSERT ... ON CONFLICT: locks events FOR UPDATE first.
  //   3. withdraw() waiting UPDATE (status = 'Waitlisted' guard): locks events FOR UPDATE, then re-reads the status.
  //   4. withdraw() registered UPDATE (status = 'Registered' guard): same lock and the same locked re-read.
  //   5. settleLocked() UPDATE: called by join and withdraw under the lock, by fillFreeSpots under the lock, and by
  //      settleEventWaitlist, which takes the lock itself (event GET, /me, the attendee list, the close job).
  //   6. fillFreeSpots() promotion UPDATE: reached only from withdraw(), under the lock.
  //   7. releaseWaitlistForCancelledEvent() UPDATE: its caller must hold the lock (12-C-REL and 12-C-CLOSED take it).
  //   8. beforeRegistrationWindowChange() (via settleLocked): its caller must hold the lock (11-E hook).
  // Because every writer runs under the event lock, the status read under that lock cannot change before the UPDATE, so
  // the guards on P-G and P-R are always true. The guard is therefore redundant, and removing it is equivalent.
  { id: 'P-G', name: 'the waiting withdrawal UPDATE drops its status guard (a stale read is trusted)', file: SERVICE,
    edits: [["WHERE id = $1 AND attendee_id = $2 AND status = 'Waitlisted'", 'WHERE id = $1 AND attendee_id = $2 AND ($3::timestamptz IS NOT NULL)']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-10-E')], equivalent: true },
  { id: 'P-C', name: 'the withdrawal takes no event row lock', file: SERVICE,
    edits: [["      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [current.event_id]);\n", '']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-08-B'), e2e('JOIN-WAITLIST-08-D'), e2e('JOIN-WAITLIST-10-E')] },
  { id: 'P-R', name: 'a confirmed withdrawal trusts its read: the compare-and-set guard is dropped', file: SERVICE,
    edits: [["WHERE id = $1 AND attendee_id = $2 AND status = 'Registered'\n        RETURNING *", 'WHERE id = $1 AND attendee_id = $2 AND ($3::timestamptz IS NOT NULL)\n        RETURNING *']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-08-B-INT-REPEAT')], equivalent: true },
  { id: 'P-D', name: 'fullness is checked before the window (a closed or not-yet-open event with a free place answers MSG-WL-03)', file: SERVICE,
    edits: [[JOIN_SETTLE_WINDOW, JOIN_SETTLE_WINDOW.replace("      if (state === 'not_open') throw this.notOpen(event.registration_opens_at);\n      if (state === 'closed') throw this.closed();",
      "      if (state !== 'open') {\n        const seats = await client.query<{ count: number }>(\"SELECT COUNT(*)::integer AS count FROM event_registrations WHERE event_id = $1 AND status = 'Registered'\", [eventId]);\n        if (seats.rows[0].count < event.registration_limit) throw this.waitlistNotAvailable();\n      }\n      if (state === 'not_open') throw this.notOpen(event.registration_opens_at);\n      if (state === 'closed') throw this.closed();")]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-01-D-INT-FREE')] },
  { id: 'P-I', name: 'a Cancelled entry is no longer refused with 409 (it falls through to the state check)', file: SERVICE,
    edits: [["if (status === 'Removed' || status === 'Cancelled') return { refused: this.notWithdrawable() };", "if (status === 'Removed') return { refused: this.notWithdrawable() };"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-10-F')] },
  { id: 'P-J', name: 'a direct registration no longer reactivates a Removed row', file: SERVICE,
    edits: [["WHERE event_registrations.status IN ('Withdrawn', 'Removed')", "WHERE event_registrations.status IN ('Withdrawn')"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-F')] },
  { id: 'P-E', name: 'the window closes one instant early (the closing instant is treated as open)', file: WINDOW,
    edits: [["if (event.closesAt && instant >= event.closesAt.getTime()) return 'closed';", "if (event.closesAt && instant > event.closesAt.getTime()) return 'closed';"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-01-D-BND-BOUNDARY')] },
  // ---- Capacity fields on the event read (AC2): the events service is covered by mutants as well.
  { id: 'CAP-1', name: 'waitlistAvailable ignores the registration window (a full, closed event offers the list)', file: EVENTS,
    edits: [['waitlistAvailable: isFull && registrationOpen,', 'waitlistAvailable: isFull,']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-02-B')] },
  { id: 'CAP-2', name: 'the limit ignores registration_limit and reports expected attendance', file: EVENTS,
    edits: [['const limit = Number(row.registration_limit);', 'const limit = Number(row.expected_attendance);']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-02-A')] },
  { id: 'P-K', name: 'a removed entry cannot join again (the join no longer reuses a Removed row)', file: SERVICE,
    edits: [["WHERE event_registrations.status IN ('Withdrawn', 'Removed', 'Cancelled')", "WHERE event_registrations.status IN ('Withdrawn', 'Cancelled')"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-07-D')] },
  { id: 'CAP-3', name: 'the Confirmed count is zeroed on the read (the attendee list would look open when full)', file: EVENTS,
    edits: [['const confirmed = Number(row.confirmed_registrations ?? 0);', 'const confirmed = 0;']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-02-A-LIST')] },
  // ---- TR5 additions. L-1: the attendee list read settles closed lists. W-1: a waiting withdrawal settles first. P-B: the job's due test.
  { id: 'L-1', name: 'the attendee event list does not settle closed waiting lists before it reads statuses', file: EVENTS,
    edits: [["    if (user.roles.includes('ATTENDEE') && !user.roles.includes('COORDINATOR'))\n      await runRegistrationCloseJob(this.database, this.clock.now());\n", '']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-A-STATE-LIST')] },
  { id: 'W-1', name: 'a waiting withdrawal after close does not settle the list first', file: SERVICE,
    edits: [['        await settleLocked(client, current.event_id, now);\n        status = await readStatus();', '        status = await readStatus();']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-D-ERR-WAIT')] },
  { id: 'P-B', name: 'the due predicate treats the closing instant as not yet reached (strict comparison)', file: 'src/registrations/waitlist/settle.ts',
    edits: [['${instant} >= e.registration_closes_at', '${instant} > e.registration_closes_at']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-G')] },
  // TCRX: the close job's due test ignores a manual close (registration_enabled false), so the list would not settle.
  { id: 'X-JOB-MANUAL', name: 'the due predicate ignores a manual close (a disabled registration is not due)', file: 'src/registrations/waitlist/settle.ts',
    edits: [["r.status = 'Waitlisted'\n  AND (NOT e.registration_enabled", "r.status = 'Waitlisted'\n  AND (false"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-C-STATE-LIST')] },
  // Requirement Review additions: the attendee audience (N-1), the releaser notices (R-N), the post-lock re-read (A1-STALE).
  { id: 'N-1', name: 'the attendee audience for waiting list notices is removed (an attendee reads nothing)', file: EVENTS,
    edits: [["      ...(user.roles.includes('ATTENDEE') ? ['WaitlistPromoted', 'EventCancelled'] : []),\n", '']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-09-C')] },
  { id: 'R-N', name: 'the cancel releaser writes no EventCancelled notice', file: 'src/registrations/waitlist/cancel-releaser.ts',
    edits: [['for (const row of cancelled.rows) {', 'for (const row of [] as { attendee_id: string }[]) {']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-12-C-REL')] },
  { id: 'F6-SKIP', name: 'the withdrawal skips the settle after the locked re-read says Waitlisted', file: SERVICE,
    edits: [['        await settleLocked(client, current.event_id, now);\n        status = await readStatus();', '        status = await readStatus();']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-10-H')] },
  // Round-7 review additions. X1/X2: the attendee notice audience. X3: the releaser's dedupe guard. X4: the releaser's settle.
  { id: 'X1', name: 'EventCancelled is removed from the attendee audience (an attendee cannot read the cancellation notice)', file: EVENTS,
    edits: [["      ...(user.roles.includes('ATTENDEE') ? ['WaitlistPromoted', 'EventCancelled'] : []),", "      ...(user.roles.includes('ATTENDEE') ? ['WaitlistPromoted'] : []),"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-12-C-VIS')] },
  { id: 'X2', name: 'EventCancelled no longer maps to the attendee audience role', file: EVENTS,
    edits: [["if (type === 'WaitlistPromoted' || type === 'EventCancelled') return 'attendee';", "if (type === 'WaitlistPromoted') return 'attendee';"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-12-C-VIS')] },
  { id: 'X3', name: 'the releaser cancels a second time and notices again (its dedupe on Waitlisted is dropped)', file: 'src/registrations/waitlist/cancel-releaser.ts',
    edits: [["      WHERE event_id = $1 AND status = 'Waitlisted'\n      RETURNING attendee_id", "      WHERE event_id = $1 AND status IN ('Waitlisted', 'Cancelled')\n      RETURNING attendee_id"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-12-C-REL')] },
  { id: 'X4', name: 'the releaser cancels a closed list instead of removing it (no settle before the cancel)', file: 'src/registrations/waitlist/cancel-releaser.ts',
    edits: [['  await settleLocked(client, eventId, now);\n  const event = await client.query', '  const event = await client.query']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-12-C-STATE-CLOSED')] },
  // B1: a read writes only for a caller who may see the event. B1-ORG restores the unconditional settle for every caller;
  // B1-UNAUTH runs the settle before the visibility check (an unauthorised read would lock and write).
  { id: 'B1-ORG', name: 'the event read settles for every caller, not only an attendee who may see the event', file: EVENTS,
    edits: [["    if (user.roles.includes('ATTENDEE') && isAttendeeViewable) await settleIfDue(this.database, id, this.clock.now());", "    if (true) await settleIfDue(this.database, id, this.clock.now());"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-H-ERR-ORG')] },
  { id: 'B1-UNAUTH', name: 'the event read settles before the visibility check (an unauthorised read locks and writes)', file: EVENTS,
    edits: [["    const isOwningOrganiser =\n      user.roles.includes('ORGANISER') && row.organiser_id === user.uid;", "    await settleIfDue(this.database, id, this.clock.now());\n    const isOwningOrganiser =\n      user.roles.includes('ORGANISER') && row.organiser_id === user.uid;"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-H-ERR-LOCK')] },
  // A1-REAL: the realistic pre-lock version: the lookup reads the status and the branch uses that pre-lock value.
  { id: 'A1-REAL', name: 'the withdrawal reads the status before the lock and branches on that value (the stale pre-lock read)', file: SERVICE,
    edits: [
      ['        `SELECT r.id, e.event_name, e.start_date_time, r.event_id', '        `SELECT r.id, r.status, e.event_name, e.start_date_time, r.event_id'],
      ['      let status = await readStatus();', '      let status = current.status;'],
    ],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-10-H')] },
  // B1 read gates: B1-NONE removes the settle for an attendee read; B1-COORD also settles for the assigned coordinator;
  // PRECHECK removes the lock-free due check, so a read of a list that is not due takes the lock.
  { id: 'B1-NONE', name: 'the event read never settles (the attendee read of a due list leaves it Waitlisted)', file: EVENTS,
    edits: [["    if (user.roles.includes('ATTENDEE') && isAttendeeViewable) await settleIfDue(this.database, id, this.clock.now());\n", '']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-H-STATE-NONE')] },
  { id: 'B1-COORD', name: 'the event read also settles for the assigned coordinator', file: EVENTS,
    edits: [["    if (user.roles.includes('ATTENDEE') && isAttendeeViewable) await settleIfDue(this.database, id, this.clock.now());", "    if (isAssignedCoordinator || (user.roles.includes('ATTENDEE') && isAttendeeViewable)) await settleIfDue(this.database, id, this.clock.now());"]],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-H-STATE-COORD')] },
  { id: 'PRECHECK', name: 'settleIfDue takes the event lock even when no entry is due (the early return is removed)', file: 'src/registrations/waitlist/settle.ts',
    edits: [['  if (!due.rows[0]) return 0;\n', '']],
    suites: ['e2e'], testMappings: [e2e('JOIN-WAITLIST-11-H-INT-NODUE')] },
];
