// SPM-132 backend fault injections. Each non-equivalent mutation targets an observable
// Venue Staff tentative-hold rule and is mapped to the matrix case that asserts it.
const E2E = 'test/venues-booking-requests.e2e-spec.ts';
const REPO_TEST = 'src/venues/repository/venues.repository.spec.ts';
const SCHEDULER_TEST = 'src/venues/tentative-hold-expiry.scheduler.spec.ts';
const REPO = 'src/venues/repository/venues.repository.ts';
const SERVICE = 'src/venues/venues.service.ts';
const MODULE = 'src/venues/venues.module.ts';
const SCHEDULER = 'src/venues/tentative-hold-expiry.scheduler.ts';
const e2e = (...ids) => ids.map((id) => ({ suite: 'backendE2E', file: E2E, title: `VEN-HOLD-DEC-${id} ` }));
const unit = (...ids) => ids.map((id) => ({ suite: 'backendUnit', file: REPO_TEST, title: `VEN-HOLD-DEC-${id} ` }));
const scheduler = (title) => ({ suite: 'backendUnit', file: SCHEDULER_TEST, title });

export const SUITES = {
  serviceBoundary: { args: ['run', 'src/venues/venues.service.spec.ts', 'src/venues/venues.controller.spec.ts'] },
  backendUnit: { args: ['run', REPO_TEST, SCHEDULER_TEST, 'src/events/venue-unavailable.spec.ts', 'src/events/queue/queue-indicators.spec.ts'] },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  {
    id: 'SPM132-SERVICE-EXPIRED-CODE', name: 'expired hold actions report the wrong conflict code', file: SERVICE,
    suites: ['serviceBoundary'],
    testMappings: [{ suite: 'serviceBoundary', file: 'src/venues/venues.service.spec.ts', title: 'VEN-HOLD-DEC-09-B maps %s to %s for either staff hold action' }],
    edits: [["code: 'TENTATIVE_HOLD_EXPIRED'", "code: 'WRONG_EXPIRY_CODE'"]],
  },
  {
    id: 'SPM132-SERVICE-RELEASE-RESULT', name: 'successful release drops the persisted result', file: SERVICE,
    suites: ['serviceBoundary'],
    testMappings: [{ suite: 'serviceBoundary', file: 'src/venues/venues.service.spec.ts', title: 'VEN-HOLD-DEC-10-A returns a successful release unchanged' }],
    edits: [["return holdActionOrThrow(await this.repository.releaseTentativeHold(staff.uid, bookingId));", "await holdActionOrThrow(await this.repository.releaseTentativeHold(staff.uid, bookingId)); return undefined;"]],
  },
  {
    id: 'SPM132-ROUTE-CONVERT-BOOKING-ID', name: 'conversion route forwards a different booking id', file: 'src/venues/venues.controller.ts',
    suites: ['serviceBoundary'],
    testMappings: [{ suite: 'serviceBoundary', file: 'src/venues/venues.controller.spec.ts', title: 'VEN-HOLD-DEC-09-A forwards %s to the service' }],
    edits: [["return this.venues.convertTentativeHold(\n      request[CURRENT_USER_REQUEST_KEY],\n      bookingId,\n    );", "return this.venues.convertTentativeHold(\n      request[CURRENT_USER_REQUEST_KEY],\n      'different-booking',\n    );"]],
  },
  {
    id: 'SPM132-PERSISTED-EXPIRED-CLASSIFICATION', name: 'persisted expired holds disappear from event hold state',
    file: 'src/events/venue-unavailable.ts', suites: ['backendUnit'],
    testMappings: [{ suite: 'backendUnit', file: 'src/events/venue-unavailable.spec.ts', title: 'VEN-HOLD-DEC-06-B recognises a persisted expired tentative hold' }],
    edits: [["if (booking.status === 'expired') return 'expired';", "if (booking.status === 'expired') return null;"]],
  },
  {
    id: 'SPM132-APPROVAL-336H-EQUALITY',
    name: 'approval rejects equality at the 336-hour boundary',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('04-BND-1'),
    edits: [['if (leadHours < 336)', 'if (leadHours <= 336)']],
  },
  {
    id: 'SPM132-APPROVAL-336H-OMITTED',
    name: 'approval no longer rechecks the hold lead-time boundary',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('04-BND-2'),
    edits: [['if (leadHours < 336)', 'if (false)']],
  },
  {
    id: 'SPM132-STAFF-ROLE-GUARD',
    name: 'Coordinator role is accepted by the Venue Staff decision gate',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: e2e('01-SEC-2'),
    edits: [["!user.roles.includes('VENUE_STAFF') ||", 'false ||']],
  },
  {
    id: 'SPM132-OWNED-VENUE-SCOPE',
    name: 'staff hold decisions are not scoped to the caller-owned venue',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('01-SEC-1'),
    edits: [['AND v.owner_user_id::text = $2::text', 'AND $2::text IS NOT NULL']],
  },
  {
    id: 'SPM132-PENDING-VENUE-NAME',
    name: 'pending queue labels a hold with the wrong venue name',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('02-A'),
    edits: [[
      'coordinator_user.display_name AS coordinator_name,\n              v.name AS venue_name,',
      'coordinator_user.display_name AS coordinator_name,\n              e.event_name AS venue_name,',
    ]],
  },
  {
    id: 'SPM132-CONVERT-EXPIRY-STRICT',
    name: 'conversion remains available at the exact expiry instant',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('09-B'),
    edits: [['expiry.getTime() <= now.getTime()', 'expiry.getTime() < now.getTime()']],
  },
  {
    id: 'SPM132-CONVERT-CLEAR-EXPIRY',
    name: 'conversion leaves the tentative expiry attached to the confirmed booking',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('12-A'),
    edits: [['SET request_kind = \'booking\', hold_expires_at = NULL', "SET request_kind = 'booking', hold_expires_at = hold_expires_at"]],
  },
  {
    id: 'SPM132-RELEASE-STATUS', name: 'release leaves the hold approved', file: REPO,
    suites: ['backendE2E'], testMappings: e2e('13-A'),
    edits: [["SET status = 'released', released_at = $2::timestamptz", "SET status = 'approved', released_at = $2::timestamptz"]],
  },
  {
    id: 'SPM132-RELEASE-TIMESTAMP', name: 'release does not persist the release time', file: REPO,
    suites: ['backendE2E'], testMappings: e2e('13-A'),
    edits: [["SET status = 'released', released_at = $2::timestamptz", "SET status = 'released', released_at = NULLIF($2::timestamptz, $2::timestamptz)"]],
  },
  {
    id: 'SPM132-RELEASE-CALENDAR', name: 'calendar still includes released holds', file: REPO,
    suites: ['backendE2E'], testMappings: e2e('13-A'),
    edits: [["AND ((b.status = 'approved' AND\n              (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL", "AND ((b.status IN ('approved', 'released') AND\n              (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL"]],
  },
  {
    id: 'SPM132-REJECTION-MAX-BOUNDARY', name: 'rejection reasons of exactly 1000 characters are refused', file: SERVICE,
    suites: ['backendE2E'], testMappings: e2e('07-BND-2'),
    edits: [['const REJECTION_REASON_MAX_LENGTH = 1000;', 'const REJECTION_REASON_MAX_LENGTH = 999;']],
  },
  {
    id: 'SPM132-LIFECYCLE-VENUE-LOCK', name: 'hold lifecycle decisions do not lock the venue', file: REPO,
    suites: ['backendE2E'], testMappings: e2e('09-PERF-1'),
    edits: [['SELECT setup_time_minutes, turnaround_time_minutes FROM venues\n        WHERE id = $1::uuid FOR UPDATE', 'SELECT setup_time_minutes, turnaround_time_minutes FROM venues\n        WHERE id = $1::uuid']],
  },
  {
    id: 'SPM132-PERSIST-EXPIRED-STATUS', name: 'expiry processing keeps the persisted status approved', file: REPO,
    suites: ['backendE2E'], testMappings: e2e('06-B'),
    edits: [["SET status = 'expired', hold_expiry_processed_at = $1::timestamptz", "SET status = 'approved', hold_expiry_processed_at = $1::timestamptz"]],
  },
  {
    id: 'SPM132-APPROVAL-CONFLICT-RECHECK',
    name: 'approval ignores decision-time booking and closure conflicts',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: [...e2e('03-B', '03-C'), ...e2e('11-B', '11-C')],
    edits: [['if (conflict.rows.length)\n        return {', 'if (false)\n        return {']],
  },
  {
    id: 'SPM132-SETUP-CONFLICT-WINDOW',
    name: 'approval conflict calculation omits venue setup occupancy',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('08-BND-1'),
    edits: [[
      'WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid\n              AND ((b.status = \'approved\' AND\n                (b.request_kind <> \'tentative_hold\' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $7::timestamptz)) OR\n                (b.status = \'pending\' AND\n                  (b.hold_expires_at > $7::timestamptz OR\n                   (b.request_kind <> \'tentative_hold\' AND EXISTS (\n                    SELECT 1 FROM venue_booking_requests r\n                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id\n                   )))))\n              AND b.start_at - make_interval(mins => $4::int)',
      'WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid\n              AND ((b.status = \'approved\' AND\n                (b.request_kind <> \'tentative_hold\' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $7::timestamptz)) OR\n                (b.status = \'pending\' AND\n                  (b.hold_expires_at > $7::timestamptz OR\n                   (b.request_kind <> \'tentative_hold\' AND EXISTS (\n                    SELECT 1 FROM venue_booking_requests r\n                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id\n                   )))))\n              AND b.start_at',
    ]],
  },
  {
    id: 'SPM132-TURNAROUND-CONFLICT-WINDOW',
    name: 'approval conflict calculation omits venue turnaround occupancy',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('08-BND-1'),
    edits: [[
      'WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid\n              AND ((b.status = \'approved\' AND\n                (b.request_kind <> \'tentative_hold\' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $7::timestamptz)) OR\n                (b.status = \'pending\' AND\n                  (b.hold_expires_at > $7::timestamptz OR\n                   (b.request_kind <> \'tentative_hold\' AND EXISTS (\n                    SELECT 1 FROM venue_booking_requests r\n                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id\n                   )))))\n              AND b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz + make_interval(mins => $5::int)\n              AND b.end_at + make_interval(mins => $5::int)',
      'WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid\n              AND ((b.status = \'approved\' AND\n                (b.request_kind <> \'tentative_hold\' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $7::timestamptz)) OR\n                (b.status = \'pending\' AND\n                  (b.hold_expires_at > $7::timestamptz OR\n                   (b.request_kind <> \'tentative_hold\' AND EXISTS (\n                    SELECT 1 FROM venue_booking_requests r\n                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id\n                   )))))\n              AND b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz + make_interval(mins => $5::int)\n              AND b.end_at',
    ]],
  },
  {
    id: 'SPM132-EXPIRY-AT-EQUALITY',
    name: 'due expiry is not processed at exact equality',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('06-B'),
    edits: [['hold_expires_at <= $1::timestamptz', 'hold_expires_at < $1::timestamptz']],
  },
  {
    id: 'SPM132-EXPIRY-IDEMPOTENCY',
    name: 'expiry processor rewrites rows already marked as processed',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('06-B'),
    edits: [["WHERE request_kind = 'tentative_hold' AND status = 'approved'\n          AND hold_expires_at <= $1::timestamptz AND hold_expiry_processed_at IS NULL", "WHERE request_kind = 'tentative_hold' AND status IN ('approved', 'expired')\n          AND hold_expires_at <= $1::timestamptz"]],
  },
  {
    id: 'SPM132-SCHEDULER-WIRING',
    name: 'Nest does not register the automatic hold expiry scheduler',
    file: MODULE,
    suites: ['backendE2E'],
    testMappings: e2e('06-B'),
    edits: [['    TentativeHoldExpiryScheduler,\n', '']],
  },
  {
    id: 'SPM132-SCHEDULER-DEFAULT-INTERVAL',
    name: 'invalid scheduler interval no longer falls back to the documented default',
    file: SCHEDULER,
    suites: ['backendUnit'],
    testMappings: [scheduler('VEN-HOLD-DEC-06-B falls back to the default interval when configuration is invalid')],
    edits: [[': DEFAULT_INTERVAL_MS', ': 1_000']],
  },
  {
    id: 'SPM132-SCHEDULER-ERROR-RECOVERY',
    name: 'scheduler retains its running lock after a processor failure',
    file: SCHEDULER,
    suites: ['backendUnit'],
    testMappings: [scheduler('VEN-HOLD-DEC-06-B logs processor errors and allows a later scheduled attempt')],
    edits: [['      this.running = false;', '      this.running = true;']],
  },
];
