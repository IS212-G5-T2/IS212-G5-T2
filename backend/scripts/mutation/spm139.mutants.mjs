// SPM-139 backend mutants (registration settings, the window rule, the save transaction and the promotion it calls).
// Run by run.mjs: `node scripts/mutation/run.mjs --mutants spm139.mutants.mjs`. Each edit is [from, to]; `from` must
// occur exactly once in its file (the runner reports MISAPPLIED otherwise). Each mutant names the test that must go red.
// A title is either a plain test title or the source text of an it.each title with its %s, %j, %i placeholders; the runner
// turns a placeholder title into a pattern for the expanded test names (title-pattern.mjs).
export const SUITES = {
  // Pure rules and window state: registration-settings.validation.spec.ts and registration-window.spec.ts.
  unit: { args: ['run', 'src/registrations/settings', 'src/registrations/registration'] },
  // Real PostgreSQL: save transaction, lock, promotion and settle through the HTTP API.
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/registration-settings.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const VALIDATION = 'src/registrations/settings/registration-settings.validation.ts';
const SERVICE = 'src/registrations/settings/registration-settings.service.ts';
const WINDOW = 'src/registrations/registration/registration-window.ts';
const PROMOTION = 'src/registrations/waitlist/promotion.ts';
const SETTLE = 'src/registrations/waitlist/settle.ts';

const unitSpec = 'src/registrations/settings/registration-settings.validation.spec.ts';
const windowSpec = 'src/registrations/registration/registration-window.spec.ts';
const serviceSpec = 'src/registrations/settings/registration-settings.service.spec.ts';
const e2eSpec = 'test/registration-settings.e2e-spec.ts';

const unit = (file, title) => ({ suite: 'unit', file, title });
const e2e = (title) => ({ suite: 'e2e', file: e2eSpec, title });

export const MUTANTS = [
  // ---- Validation rules (pure, unit suite)
  { id: 'M1', name: 'closing equal to the event start refused (start boundary written as >=)', file: VALIDATION,
    edits: [['closesAt.getTime() > event.startsAt.getTime()', 'closesAt.getTime() >= event.startsAt.getTime()']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-06-C: a closing time equal to the event start is accepted'),
      unit(unitSpec, 'CONFIG-REG-06-C: closing %s against the 18:00 start: accepted=%s')] },
  { id: 'M2', name: 'closing equal to the opening time accepted (opening boundary written as <)', file: VALIDATION,
    edits: [['closesAt.getTime() <= opensAt.getTime()', 'closesAt.getTime() < opensAt.getTime()']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-05-C: a closing time equal to the opening time is refused'),
      unit(unitSpec, 'CONFIG-REG-05-C: opening %s and closing %s: refused with the closing-after-opening text'),
      unit(unitSpec, 'CONFIG-REG-05-C: an opening time %s the saved closing time is refused with INVALID_PERIOD on the closing field')] },
  { id: 'M3', name: 'capacity 0 accepted (lower bound moved to 0)', file: VALIDATION,
    edits: [['!Number.isInteger(capacity) || capacity < 1', '!Number.isInteger(capacity) || capacity < 0']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-07-D: capacity 0 is refused'),
      unit(unitSpec, 'CONFIG-REG-07-C: refuses capacity %j with INVALID_CAPACITY')] },
  { id: 'M4', name: 'the maximum capacity refused (upper bound written as >=)', file: VALIDATION,
    edits: [['if (capacity > maxCapacity)', 'if (capacity >= maxCapacity)']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-07-D: capacity 2147483647 is accepted'),
      unit(unitSpec, 'CONFIG-REG-07-D: accepts capacity %i')] },
  { id: 'M5', name: 'non-whole capacity accepted (whole-number check removed)', file: VALIDATION,
    edits: [['typeof capacity !== \'number\' || !Number.isInteger(capacity) || capacity < 1', 'typeof capacity !== \'number\' || capacity < 1']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-07-C: capacity 2.5 is refused'),
      unit(unitSpec, 'CONFIG-REG-07-C: refuses capacity %j with INVALID_CAPACITY')] },
  { id: 'M6', name: 'enabling accepted without its period (completeness check removed)', file: VALIDATION,
    edits: [['  if (registrationEnabled) {', '  if (false) {']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-01-E: refuses enabling when the opening time is missing'),
      unit(unitSpec, 'CONFIG-REG-01-E: refuses enabling when the closing time is missing')] },
  { id: 'M7', name: 'a capacity equal to the Confirmed count refused (minimum written as <=)', file: VALIDATION,
    edits: [['if (capacity < confirmedCount)', 'if (capacity <= confirmedCount)']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-08-B: a capacity equal to the Confirmed count is accepted'),
      unit(unitSpec, 'CONFIG-REG-08-B: capacity %i with 5 Confirmed: accepted=%s')] },
  { id: 'M8', name: 'a date-time without an offset accepted (offset requirement removed)', file: VALIDATION,
    edits: [["if (typeof value !== 'string' || !DATETIME_PATTERN.test(value)) return undefined;", "if (typeof value !== 'string') return undefined;"]],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-02-D: a date-time without an offset is refused'),
      unit(unitSpec, 'CONFIG-REG-02-D: refuses a date-time that is %s with 400 INVALID_DATETIME')] },
  { id: 'M9', name: 'a lone capacity change drops the saved opening time (merge does not keep saved values)', file: VALIDATION,
    edits: [['const opensAt = patch.opensAt === undefined ? saved.opensAt : patch.opensAt;', 'const opensAt = patch.opensAt === undefined ? null : patch.opensAt;']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-02-D: a lone capacity change keeps the saved period'),
      unit(unitSpec, 'CONFIG-REG-01-B: disabling keeps the saved period and capacity')] },
  { id: 'M10', name: 'switching off clears the saved opening time (values lost on disable)', file: VALIDATION,
    edits: [['settings: { registrationEnabled, opensAt, closesAt, capacity },', 'settings: { registrationEnabled, opensAt: registrationEnabled ? opensAt : null, closesAt, capacity },']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-01-B: a disabled event keeps its saved opening time in the decision'),
      unit(unitSpec, 'CONFIG-REG-01-B: disabling keeps the saved period and capacity')] },

  // ---- Window rule (pure, unit suite)
  { id: 'M11', name: 'a switched-off event reports closed, not disabled', file: WINDOW,
    edits: [["if (!event.registrationEnabled) return 'disabled';", "if (!event.registrationEnabled) return 'closed';"]],
    suites: ['unit'], testMappings: [unit(windowSpec, 'CONFIG-REG-01-B: reports disabled, not closed, when the coordinator has switched registration off')] },
  { id: 'M12', name: 'registration open at the closing instant (close made inclusive)', file: WINDOW,
    edits: [["if (event.closesAt && instant >= event.closesAt.getTime()) return 'closed';", "if (event.closesAt && instant > event.closesAt.getTime()) return 'closed';"]],
    suites: ['unit'], testMappings: [unit(windowSpec, '[D] exactly at the closing instant, registration is closed'),
      unit(windowSpec, 'CONFIG-REG-11-A: still reports closed for an enabled event outside the window')] },

  // ---- Save transaction (real PostgreSQL)
  { id: 'M13', name: 'the save does not lock the event row (no FOR UPDATE)', file: SERVICE,
    edits: [["const row = await this.findEvent(query, eventId, ' FOR UPDATE');", "const row = await this.findEvent(query, eventId, '');"]],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-08-D: a save waits for a registration that holds the event row lock, then counts its place')] },
  { id: 'M14', name: 'the old window is not settled before the change (an extension restores removed entries)', file: SERVICE,
    edits: [['      // The old window first: whatever the previous settings had already removed stays removed (06-E).\n      await settleLocked(client, eventId, now);\n', '      // The old window first: whatever the previous settings had already removed stays removed (06-E).\n']],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-X-02: extending the closing time does not restore the removed entries')] },
  { id: 'M15', name: 'a capacity increase does not promote the waiting list', file: SERVICE,
    edits: [['const promoted = next.capacity > saved.capacity ? await fillFreeSpots(client, eventId, now) : 0;', 'const promoted = next.capacity < saved.capacity ? await fillFreeSpots(client, eventId, now) : 0;']],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-09-A/E: raising capacity promotes the earliest waiting entries with one notification each')] },
  { id: 'M16', name: 'a save does not bump the version (stale saves accepted)', file: SERVICE,
    edits: [['registration_settings_version = registration_settings_version + 1,', 'registration_settings_version = registration_settings_version,']],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-X-03: a save with a stale version is refused with SETTINGS_CONFLICT')] },
  { id: 'M17', name: 'a Submitted event may be configured (status allowlist widened)', file: SERVICE,
    edits: [["new Set(['Approved', 'Planning', 'Confirmed'])", "new Set(['Approved', 'Planning', 'Confirmed', 'Submitted'])"]],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-04-B: a Submitted event refuses the settings')] },
  { id: 'M18', name: 'the Confirmed minimum counts waiting entries', file: SERVICE,
    edits: [["WHERE event_id = $1 AND status = 'Registered'`,", "WHERE event_id = $1 AND status IN ('Registered', 'Waitlisted')`,"]],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-08-B: 4 is refused below the 5 Confirmed; 5 is accepted and the waiting list is unchanged')] },

  // ---- Promotion and settle (real PostgreSQL)
  { id: 'M19', name: 'promotion ordered by attendee id, not join order', file: PROMOTION,
    edits: [['ORDER BY joined_at, waitlist_seq', 'ORDER BY attendee_id']],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-09-D: the first to join is promoted first, whatever the attendee ids')] },
  { id: 'M20', name: 'promotion notification has the wrong type', file: PROMOTION,
    edits: [["'WaitlistPromoted'", "'WaitlistPromotedX'"]],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-09-A/E: raising capacity promotes the earliest waiting entries with one notification each')] },
  { id: 'M21', name: 'switching off does not remove the waiting list (settle ignores the disabled flag)', file: SETTLE,
    edits: [['AND (NOT e.registration_enabled', 'AND (FALSE']],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-X-04: raising capacity on a disabled event removes the waiting list and promotes nobody')] },
  { id: 'M22', name: 'a non-boolean registrationEnabled accepted (boolean check removed)', file: VALIDATION,
    edits: [["if (typeof input.registrationEnabled !== 'boolean')", "if (false)"]],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-11-C: a non-boolean registrationEnabled is refused with 400')] },
  { id: 'M23', name: 'isRegistrationOpen true for a closed or not-yet-open window (predicate widened)', file: WINDOW,
    edits: [["return registrationWindowState(event, now) === 'open';", "return registrationWindowState(event, now) !== 'disabled';"]],
    suites: ['unit'], testMappings: [unit(windowSpec, 'CONFIG-REG-02-C: isRegistrationOpen is true only inside an open, enabled, Confirmed window')] },
  { id: 'M24', name: 'a Completed event may be configured (status allowlist widened to Completed)', file: SERVICE,
    edits: [["new Set(['Approved', 'Planning', 'Confirmed'])", "new Set(['Approved', 'Planning', 'Confirmed', 'Completed'])"]],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-04-E: a PUT on a Completed event with the UI bypassed is refused and the settings are unchanged')] },
  { id: 'M25', name: 'an SGT opening time stored an hour late (UTC conversion shifted)', file: SERVICE,
    edits: [['[eventId, next.registrationEnabled, next.opensAt, next.closesAt, next.capacity, now],', '[eventId, next.registrationEnabled, next.opensAt ? new Date(next.opensAt.getTime() + 3600000) : null, next.closesAt, next.capacity, now],']],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-02-B: an SGT opening time is stored in UTC and read back across the date boundary')] },
  { id: 'M26', name: 'the saved capacity stored one place higher', file: SERVICE,
    edits: [['next.closesAt, next.capacity, now],', 'next.closesAt, next.capacity + 1, now],']],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-03-A: the saved capacity is returned and an Attendee sees it as the limit with every place available')] },
  { id: 'M27', name: 'a closing time one minute after the opening time refused (boundary widened by a minute)', file: VALIDATION,
    edits: [['if (opensAt && closesAt && closesAt.getTime() <= opensAt.getTime())', 'if (opensAt && closesAt && closesAt.getTime() <= opensAt.getTime() + 60000)']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-05-D: a closing time one minute after the opening time is accepted')] },
  { id: 'M28', name: 'a promotion notification addressed to the event instead of the attendee', file: PROMOTION,
    edits: [['[randomUUID(), entry.attendee_id, MESSAGES.waitlistPromoted', '[randomUUID(), eventId, MESSAGES.waitlistPromoted']],
    suites: ['e2e'], testMappings: [e2e('CONFIG-REG-09-E: only the moved Attendees get one notification each, and the one left waiting gets none')] },

  // ---- Plain tests that no earlier mutant failed (each edit below changes the line the named test exercises)
  { id: 'M29', name: 'a switched-off event that is not Confirmed reports disabled (status check removed)', file: WINDOW,
    edits: [["if (event.status !== 'Confirmed') return 'closed';", "if (false) return 'closed';"]],
    suites: ['unit'], testMappings: [unit(windowSpec, 'CONFIG-REG-11-A: reports closed, not disabled, for a switched-off event that is not Confirmed')] },
  { id: 'M30', name: 'a request with no signed-in user passes the coordinator guard (authentication check removed)', file: SERVICE,
    edits: [["if (!identity?.uid) throw new UnauthorizedException('Authentication required.');", "if (false) throw new UnauthorizedException('Authentication required.');"]],
    suites: ['unit'], testMappings: [unit(serviceSpec, 'CONFIG-REG-01-D: refuses a request with no signed-in user before any database read')] },
  { id: 'M31', name: 'a valid period refused (closing-after-opening comparison inverted to >=)', file: VALIDATION,
    edits: [['closesAt.getTime() <= opensAt.getTime()', 'closesAt.getTime() >= opensAt.getTime()']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-02-C: accepts an opening time before the current time')] },
  { id: 'M32', name: 'a capacity above the column maximum accepted (upper bound check removed)', file: VALIDATION,
    edits: [['if (capacity > maxCapacity)', 'if (false)']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-07-D: refuses 2147483648 with CAPACITY_TOO_LARGE, never a server error')] },
  { id: 'M33', name: 'the period is only validated while registration is enabled', file: VALIDATION,
    edits: [['if (patch.opensAt !== undefined || patch.closesAt !== undefined) {', 'if (registrationEnabled && (patch.opensAt !== undefined || patch.closesAt !== undefined)) {']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-02-D: validates a provided period even while registration is disabled')] },
  { id: 'M34', name: 'an unknown request field accepted (strict key check removed)', file: VALIDATION,
    edits: [['if (!KNOWN_FIELDS.includes(key)) return invalid(key, SETTINGS_ERROR_CODES.validation, SETTINGS_MESSAGES.unknownField);', '']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-11-C: refuses an unknown field %s with 400')] },
  { id: 'M35', name: 'the offset of a date-time ignored (read as Z)', file: VALIDATION,
    edits: [['const instant = new Date(value);', "const instant = new Date(value.replace(/[+-]\\d{2}:\\d{2}$/, 'Z'));"]],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-02-B: parses an offset date-time and Z to the same instant')] },
  { id: 'M36', name: 'an hour that does not exist accepted (invalid-date check removed)', file: VALIDATION,
    edits: [['return Number.isNaN(instant.getTime()) ? undefined : instant;', 'return instant;']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-02-D: refuses an opening time whose hour is 25')] },
  { id: 'M37', name: 'a day that does not exist accepted (calendar round-trip removed)', file: VALIDATION,
    edits: [['  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day)\n    return undefined;\n', '']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-02-D: refuses %s, a day that does not exist, with INVALID_DATETIME')] },
  // The month is guarded twice (calendar round-trip, then the invalid-date check), so only removing both lets month 13 through.
  { id: 'M38', name: 'a month that does not exist accepted (calendar round-trip and invalid-date check both removed)', file: VALIDATION,
    edits: [
      ['  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day)\n    return undefined;\n', ''],
      ['return Number.isNaN(instant.getTime()) ? undefined : instant;', 'return instant;'],
    ],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-02-D: refuses an opening time whose month does not exist')] },
  { id: 'M39', name: 'a real calendar day refused (month compared without the zero-based offset)', file: VALIDATION,
    edits: [['calendar.getUTCMonth() !== month - 1', 'calendar.getUTCMonth() !== month']],
    suites: ['unit'], testMappings: [unit(unitSpec, 'CONFIG-REG-02-D: still accepts %s')] },
];
