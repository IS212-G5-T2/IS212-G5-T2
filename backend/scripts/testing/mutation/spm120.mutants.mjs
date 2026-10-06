// SPM-120 backend mutants, run by run.mjs. Each edit is [from, to]; `from` must occur exactly once in the file
// (the runner reports MISAPPLIED otherwise). IDs match docs/specs/SPM-120-test-results.md, "Mutation spot-check".
// Not reproduced here: M8 (UTC day, frontend formatter that no longer exists; see M8-fe), M11 (local wall-clock text
// written to the column, which needs a TZ-specific run of the 05-E block).
export const SUITES = {
  // Unit specs for the registrations module (the recording-client spec and the predicate spec).
  unit: { args: ['run', 'src/registrations'] },
  // PostgreSQL integration suite; needs DATABASE_URL with database/postgresql/init 001 to 007 applied.
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'src/registrations/registrations.withdraw'],
    needsEnv: ['DATABASE_URL'],
  },
};

const SERVICE = 'src/registrations/registrations.service.ts';
const EVENT_BLOCK = `      if (hasEventStarted({ startDateTime: current.start_date_time }, now))
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: REGISTRATION_ERROR_CODES.eventAlreadyOccurred,
          message: MESSAGES.eventAlreadyOccurred,
        });

`;
const STATE_CHECK = "      if (current.status !== 'Registered') throw this.alreadyWithdrawn();\n";
const NOT_FOUND = '      if (!current) throw new NotFoundException(MESSAGES.registrationNotFound);\n';
const GUARD = '      if (!updated.rows[0]) throw this.alreadyWithdrawn();\n';
const UPDATE_SQL = `        \`UPDATE event_registrations
            SET status = 'Withdrawn', withdrawn_at = $3, updated_at = $3
          WHERE id = $1 AND attendee_id = $2 AND status = 'Registered'
        RETURNING *\`,`;

export const MUTANTS = [
  { id: 'M1', name: '`>=` to `>` in hasEventStarted (event start no longer exclusive)', file: 'src/registrations/event-start.ts',
    edits: [['return now.getTime() >= event.startDateTime.getTime();', 'return now.getTime() > event.startDateTime.getTime();']], suites: ['unit', 'e2e'] },
  { id: 'M2', name: 'ownership filter dropped from the lookup', file: SERVICE,
    edits: [['WHERE r.id = $1 AND r.attendee_id = $2', 'WHERE r.id = $1 AND ($2::uuid IS NOT NULL)']], suites: ['unit', 'e2e'] },
  { id: 'M3', name: "status guard removed from the compare-and-set UPDATE", file: SERVICE,
    edits: [["WHERE id = $1 AND attendee_id = $2 AND status = 'Registered'", 'WHERE id = $1 AND attendee_id = $2 AND ($3::timestamptz IS NOT NULL)']], suites: ['unit', 'e2e'] },
  { id: 'M4', name: 'UPDATE replaced by a DELETE (hard delete)', file: SERVICE,
    edits: [[UPDATE_SQL, "        `DELETE FROM event_registrations WHERE id = $1 AND attendee_id = $2 AND status = 'Registered' AND ($3::timestamptz IS NOT NULL) RETURNING *`,"]], suites: ['unit', 'e2e'] },
  { id: 'M5', name: 'server-side event-start check removed', file: SERVICE,
    edits: [['if (hasEventStarted({ startDateTime: current.start_date_time }, now))', 'if (false)']], suites: ['unit', 'e2e'] },
  { id: 'M6', name: '403 instead of 404 for a non-owner', file: SERVICE,
    edits: [[NOT_FOUND, '      if (!current) throw new ForbiddenException(MESSAGES.registrationNotFound);\n']], suites: ['unit', 'e2e'] },
  { id: 'M10', name: 'withdrawn_at taken from SQL now() instead of the injected clock', file: SERVICE,
    edits: [["SET status = 'Withdrawn', withdrawn_at = $3, updated_at = $3", "SET status = 'Withdrawn', withdrawn_at = now(), updated_at = $3"]], suites: ['unit', 'e2e'] },
  { id: 'M22', name: 'event-start check runs before the already-withdrawn check', file: SERVICE,
    edits: [[STATE_CHECK, ''], ['      // Compare-and-set: only the request that still sees', `${STATE_CHECK}\n      // Compare-and-set: only the request that still sees`]], suites: ['e2e'] },
  { id: 'M23', name: 'body validated after the ownership lookup', file: SERVICE,
    edits: [['    this.requireEmptyBody(body);\n    // A malformed id', '    // A malformed id'], [NOT_FOUND, `${NOT_FOUND}      this.requireEmptyBody(body);\n`]], suites: ['unit', 'e2e'] },
  { id: 'M24', name: 'an array body treated like {}', file: SERVICE,
    edits: [["const isObject = typeof body === 'object' && !Array.isArray(body);", "const isObject = typeof body === 'object';"]], suites: ['unit', 'e2e'] },
  { id: 'M25', name: 'unknown keys ignored (every bad body gets the form-level error)', file: SERVICE,
    edits: [["    if (isObject) for (const key of keys) errors[key] = 'This field is not accepted.';\n    else errors.form = 'This request does not accept a body.';", "    errors.form = 'This request does not accept a body.';"]], suites: ['unit', 'e2e'] },
  { id: 'M34', name: 'UPDATE issued before the event-start check (the transaction rolls it back, so only the recording client sees it)', file: SERVICE,
    edits: [[EVENT_BLOCK, ''], [GUARD, `${EVENT_BLOCK.replace(/\n$/, '')}\n${GUARD}`]], suites: ['unit', 'e2e'] },
  { id: 'M35', name: "a status filter added to the lookup (a Cancelled event can no longer be withdrawn from)", file: SERVICE,
    edits: [['WHERE r.id = $1 AND r.attendee_id = $2', "WHERE r.id = $1 AND r.attendee_id = $2 AND e.status <> 'Cancelled'"]], suites: ['e2e'] },
  { id: 'M36', name: 'a role guard added (non-attendees get 403 instead of 404)', file: SERVICE,
    edits: [['    this.requireEmptyBody(body);\n    // A malformed id', "    if (!identity.roles.includes('ATTENDEE')) throw new ForbiddenException(MESSAGES.attendeeOnly);\n    this.requireEmptyBody(body);\n    // A malformed id"]], suites: ['e2e'] },
  { id: 'M43', name: 'null name, email and contact not coerced (a legacy registration answers null)', file: SERVICE,
    edits: [["attendeeName: row.full_name ?? '',", 'attendeeName: row.full_name,'], ["fullName: row.full_name ?? '',", 'fullName: row.full_name,'], ["email: row.email ?? '',", 'email: row.email,']], suites: ['e2e'] },
  { id: 'M44', name: 'the lookup reads the event END column as its start (only a real database can see the wrong column)', file: SERVICE,
    edits: [['SELECT r.id, r.status, e.event_name, e.start_date_time', 'SELECT r.id, r.status, e.event_name, e.end_date_time AS start_date_time']], suites: ['unit', 'e2e'] },
];
