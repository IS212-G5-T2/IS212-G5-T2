// Focused SPM-159 approval-expiry and venue-schedule mutants.
// Each mutant maps to an exact test; suite links are derived for the scoped files.
export const SUITES = {
  backendUnit: {
    args: [
      'run',
      'src/venues/availability/dto/tentative-hold-request.spec.ts',
      'src/venues/availability/tentative-hold-request.spec.ts',
      'src/venues/repository/tentative-hold.repository.spec.ts',
      'src/venues/repository/venues.repository.spec.ts',
      'src/venues/venues.controller.spec.ts',
      'src/events/status/readiness.spec.ts',
      'src/events/status/checklist.spec.ts',
      'src/events/queue/queue-indicators.spec.ts',
      'src/events/venue-unavailable.spec.ts',
      'src/events/venue-summary.spec.ts',
      'src/events/events.service.spec.ts',
      'src/events/status/arrangements.reader.spec.ts',
      'src/events/planning/event-planning.repository.spec.ts',
      'src/events/planning/event-planning.service.spec.ts',
    ],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/venues-booking-requests.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
  eventsE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-approved-hold.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const REPOSITORY = 'src/venues/repository/venues.repository.ts';
const HOLD_RULE = 'src/events/venue-unavailable.ts';
const READINESS = 'src/events/status/readiness.ts';
const QUEUE_INDICATORS = 'src/events/queue/queue-indicators.ts';
const VENUE_SUMMARY = 'src/events/venue-summary.ts';
const PLANNING_REPOSITORY = 'src/events/planning/event-planning.repository.ts';
const EVENTS_SERVICE = 'src/events/events.service.ts';
const QUEUE_SERVICE = 'src/events/queue/coordinator-queue.service.ts';
const ARRANGEMENTS_READER = 'src/events/status/arrangements.reader.ts';
const PLANNING_SERVICE = 'src/events/planning/event-planning.service.ts';
const SERVICE = 'src/venues/venues.service.ts';
const HOLD_MIGRATION = 'migrations/024_spm159_tentative_hold_requests.sql';

export const MUTANTS = [
  {
    id: 'SPM159-APPROVAL-EXPIRY-14D',
    name: 'approved tentative hold expires 13 days after approval instead of 14',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-HOLD-04-A computes expiry from the approval clock for a tentative hold',
    ],
    edits: [[
      'new Date(this.clock.now().getTime() + 14 * 24 * 60 * 60 * 1000)',
      'new Date(this.clock.now().getTime() + 13 * 24 * 60 * 60 * 1000)',
    ]],
  },
  {
    id: 'SPM159-ORDINARY-APPROVAL-EXPIRY',
    name: 'ordinary booking approval overwrites hold expiry instead of preserving it',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: approves a pending request and writes the audit row with the actor',
    ],
    edits: [[
      "                  ELSE hold_expires_at\n                END\n          WHERE id = $1::uuid",
      "                  ELSE $2::timestamptz\n                END\n          WHERE id = $1::uuid",
    ]],
  },
  {
    id: 'SPM159-APPROVED-HOLD-SCHEDULE-STATUS',
    name: 'approved active tentative hold is labelled as booked in the venue schedule',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: maps an approved active hold as tentative and filters expired approved holds',
    ],
    edits: [['row.status === \'approved\' && !activeTentativeHold', "row.status === 'approved' && activeTentativeHold"]],
  },
  {
    id: 'SPM159-EXPIRED-HOLD-SCHEDULE-FILTER',
    name: 'expired approved tentative hold remains in the venue schedule query',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: maps an approved active hold as tentative and filters expired approved holds',
    ],
    edits: [[
      "(b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL\n                OR b.hold_expires_at > $2::timestamptz))",
      "(b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NOT NULL)",
    ]],
  },
  {
    id: 'SPM159-E2E-APPROVAL-EXPIRY-14D',
    name: 'HTTP approval gives a tentative hold a 13-day expiry instead of 14 days',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-04-A sets the hold expiry from approval time without changing ordinary bookings',
    ],
    edits: [[
      'new Date(this.clock.now().getTime() + 14 * 24 * 60 * 60 * 1000)',
      'new Date(this.clock.now().getTime() + 13 * 24 * 60 * 60 * 1000)',
    ]],
  },
  {
    id: 'SPM159-COORDINATOR-AUTHORIZATION',
    name: 'tentative hold submission no longer rejects non-Coordinator identities',
    file: SERVICE,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/availability/tentative-hold-request.spec.ts :: VEN-HOLD-01-SEC-1 rejects missing and non-Coordinator identities',
    ],
    edits: [[
      "    if (!identity.roles.includes('COORDINATOR'))\n      throw new ForbiddenException('Coordinator access required.');\n    if (!UUID.test(venueId)) throw new NotFoundException('Venue not found.');\n\n    const input = validateTentativeHoldRequest(body);",
      "    if (!UUID.test(venueId)) throw new NotFoundException('Venue not found.');\n\n    const input = validateTentativeHoldRequest(body);",
    ]],
  },
  {
    id: 'SPM159-336H-EXACT-BOUNDARY',
    name: 'an event exactly 336 setup-adjusted hours ahead is incorrectly refused',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/repository/tentative-hold.repository.spec.ts :: VEN-HOLD-03-BND-1 accepts exactly 336 hours and refuses a shorter lead',
    ],
    edits: [[
      'if (occupiedStart - this.clock.now().getTime() < 336 * 60 * 60_000)',
      'if (occupiedStart - this.clock.now().getTime() <= 336 * 60 * 60_000)',
    ]],
  },
  {
    id: 'SPM159-SAME-PAIR-ACTIVE-HOLD-DUPLICATE',
    name: 'an Active same-event/venue hold no longer prevents a duplicate request',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-C refuses another request for an event/venue with an Active hold',
    ],
    edits: [[
      "      if (activeRequest.rows[0])\n        return {\n          kind: 'already-requested' as const,\n          status: activeRequest.rows[0].status,\n        };",
      "      if (false)\n        return {\n          kind: 'already-requested' as const,\n          status: activeRequest.rows[0].status,\n        };",
    ]],
  },
  {
    id: 'SPM159-OCCUPIED-PERIOD-CONFLICT',
    name: 'the buffered occupied-period overlap predicate is reversed for tentative-hold submission',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-07-B blocks a confirmed booking and VEN-HOLD-07-C blocks an active hold',
    ],
    edits: [[
      "              AND ((b.status = 'approved' AND\n                (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $6::timestamptz)) OR\n                (b.status = 'pending' AND b.hold_expires_at > $6::timestamptz))\n              AND b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz + make_interval(mins => $5::int)",
      "              AND ((b.status = 'approved' AND\n                (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $6::timestamptz)) OR\n                (b.status = 'pending' AND b.hold_expires_at > $6::timestamptz))\n              AND b.start_at - make_interval(mins => $4::int)\n                    > $3::timestamptz + make_interval(mins => $5::int)",
    ]],
  },
  {
    id: 'SPM159-ORDINARY-BOOKING-CONFIRMED-HOLD-ONLY',
    name: 'a Pending tentative hold incorrectly blocks an ordinary booking request',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-07-SUP-CONFIRMED-ONLY blocks ordinary booking conflicts only for confirmed active holds',
    ],
    edits: [[
      "                  (b.hold_expires_at > $6::timestamptz OR\n                   (b.request_kind <> 'tentative_hold' AND EXISTS (\n                    SELECT 1 FROM venue_booking_requests r\n                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id\n                   )))))\n              AND b.start_at - make_interval(mins => $4::int)",
      "                  (b.hold_expires_at > $6::timestamptz OR b.request_kind = 'tentative_hold' OR\n                   (b.request_kind <> 'tentative_hold' AND EXISTS (\n                    SELECT 1 FROM venue_booking_requests r\n                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id\n                   )))))\n              AND b.start_at - make_interval(mins => $4::int)",
    ]],
  },
  {
    id: 'SPM159-EXPIRED-HOLD-DUPLICATE-RETRY',
    name: 'an expired approved tentative hold still blocks a same-event ordinary booking retry',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-SUP-LOOKUP allows an ordinary booking retry after the same-pair hold expires',
    ],
    edits: [[
      "(request_kind <> 'tentative_hold' OR hold_expires_at IS NULL OR hold_expires_at > $3::timestamptz)",
      "(request_kind <> 'tentative_hold' OR hold_expires_at IS NOT NULL)",
    ]],
  },
  {
    id: 'SPM159-STAFF-HOLD-API-CONTRACT',
    name: 'staff review API omits tentative hold kind or expiry fields',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-SUP-API exposes hold kind and expiry state in staff list and expiry in approval response',
    ],
    edits: [[
      '      status: row.status,\n      requestKind: row.request_kind,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: row.request_kind === \'tentative_hold\' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      rejectionReason: row.rejection_reason ?? undefined,\n      reassessmentRequired: row.reassessment_required,',
      '      status: row.status,\n      requestKind: undefined,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: row.request_kind === \'tentative_hold\' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      rejectionReason: row.rejection_reason ?? undefined,\n      reassessmentRequired: row.reassessment_required,',
    ]],
  },
  {
    id: 'SPM159-APPROVAL-EXPIRY-API-CONTRACT',
    name: 'approval API omits the tentative hold expiry timestamp',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-SUP-API exposes hold kind and expiry state in staff list and expiry in approval response',
    ],
    edits: [[
      "    requestKind: row.request_kind,\n    holdExpiresAt: row.hold_expires_at?.toISOString(),\n  };\n}",
      "    requestKind: row.request_kind,\n    holdExpiresAt: undefined,\n  };\n}",
    ]],
  },
  {
    id: 'SPM159-STAFF-HOLD-EXPIRY-STATE',
    name: 'staff API marks an unexpired approved hold as expired',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-SUP-API exposes hold kind and expiry state in staff list and expiry in approval response',
    ],
    edits: [[
      "      requestKind: row.request_kind,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      rejectionReason: row.rejection_reason ?? undefined,\n      reassessmentRequired: row.reassessment_required,",
      "      requestKind: row.request_kind,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at > now,\n      rejectionReason: row.rejection_reason ?? undefined,\n      reassessmentRequired: row.reassessment_required,",
    ]],
  },
  {
    id: 'SPM159-STAFF-LIST-OMITS-HOLD-EXPIRY',
    name: 'staff list API omits the saved expiry timestamp for an approved hold',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-SUP-API exposes hold kind and expiry state in staff list and expiry in approval response',
    ],
    edits: [[
      "      status: row.status,\n      requestKind: row.request_kind,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      rejectionReason: row.rejection_reason ?? undefined,\n      reassessmentRequired: row.reassessment_required,",
      "      status: row.status,\n      requestKind: row.request_kind,\n      holdExpiresAt: undefined,\n      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      rejectionReason: row.rejection_reason ?? undefined,\n      reassessmentRequired: row.reassessment_required,",
    ]],
  },
  {
    id: 'SPM159-STAFF-LIST-HOLD-EXPIRY-FALSE',
    name: 'staff list API always marks approved tentative holds unexpired',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-SUP-API exposes hold kind and expiry state in staff list and expiry in approval response',
    ],
    edits: [[
      "      status: row.status,\n      requestKind: row.request_kind,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      rejectionReason: row.rejection_reason ?? undefined,\n      reassessmentRequired: row.reassessment_required,",
      "      status: row.status,\n      requestKind: row.request_kind,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: false,\n      rejectionReason: row.rejection_reason ?? undefined,\n      reassessmentRequired: row.reassessment_required,",
    ]],
  },
  {
    id: 'SPM159-COORDINATOR-LIST-HOLD-KIND',
    name: 'coordinator booking list omits the tentative hold request kind',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-SUP-COORDINATOR exposes pending, active, and expired hold state through the coordinator API',
    ],
    edits: [[
      "      requestKind: row.request_kind,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      bookingReference: row.booking_reference,",
      "      requestKind: undefined,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      bookingReference: row.booking_reference,",
    ]],
  },
  {
    id: 'SPM159-COORDINATOR-LIST-HOLD-EXPIRY',
    name: 'coordinator booking list omits the approved hold expiry timestamp',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-SUP-COORDINATOR exposes pending, active, and expired hold state through the coordinator API',
    ],
    edits: [[
      "      requestKind: row.request_kind,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      bookingReference: row.booking_reference,",
      "      requestKind: row.request_kind,\n      holdExpiresAt: undefined,\n      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      bookingReference: row.booking_reference,",
    ]],
  },
  {
    id: 'SPM159-COORDINATOR-LIST-HOLD-EXPIRED',
    name: 'coordinator booking list always marks tentative holds unexpired',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-SUP-COORDINATOR exposes pending, active, and expired hold state through the coordinator API',
    ],
    edits: [[
      "      requestKind: row.request_kind,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,\n      bookingReference: row.booking_reference,",
      "      requestKind: row.request_kind,\n      holdExpiresAt: row.hold_expires_at?.toISOString(),\n      holdExpired: false,\n      bookingReference: row.booking_reference,",
    ]],
  },
  {
    id: 'SPM159-EVENT-TIME-INVALIDATION',
    name: 'changing the event time leaves its pending tentative hold approvable',
    file: HOLD_MIGRATION,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-11-B refuses approval of an event-time-invalidated request',
    ],
    edits: [[
      "       SET status = 'cancelled', reassessment_required = false",
      "       SET status = 'pending', reassessment_required = false",
    ]],
  },
  {
    id: 'SPM159-COMPETING-APPROVAL-LOCK',
    name: 'Venue Staff approvals no longer serialize on the venue row lock',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-08-B permits only one overlapping Pending request to be approved',
    ],
    edits: [[
      'SELECT setup_time_minutes, turnaround_time_minutes FROM venues\n        WHERE id = $1::uuid FOR UPDATE',
      'SELECT setup_time_minutes, turnaround_time_minutes FROM venues\n        WHERE id = $1::uuid',
    ]],
  },
  {
    id: 'SPM159-SETUP-CHANGE-REASSESSMENT',
    name: 'changing setup duration does not flag pending tentative holds for reassessment',
    file: HOLD_MIGRATION,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-13-A flags a pending hold when setup duration changes',
    ],
    edits: [[
      'IF NEW.setup_time_minutes IS DISTINCT FROM OLD.setup_time_minutes THEN',
      'IF NEW.setup_time_minutes IS NOT DISTINCT FROM OLD.setup_time_minutes THEN',
    ]],
  },
  {
    id: 'SPM159-REASSESSED-APPROVAL-GUARD',
    name: 'approval ignores the required setup reassessment and its updated lead-time check',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-HOLD-13-B refuses approval after setup reassessment makes the 336-hour lead too short',
    ],
    edits: [[
      "if (booking.request_kind === 'tentative_hold') {\n        const leadHours",
      "if (booking.request_kind === 'tentative_hold' && false) {\n        const leadHours",
    ]],
  },
  {
    id: 'SPM159-UNCONDITIONAL-LEAD-RECHECK',
    name: 'approval rechecks the 336-hour lead time only after a setup change instead of on every hold approval',
    file: REPOSITORY,
    suites: ['backendUnit', 'backendE2E'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-HOLD-03-SUP-RECHECK refuses an unflagged hold approval once the event is inside the 336-hour lead time',
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-03-SUP-RECHECK',
    ],
    edits: [[
      "if (booking.request_kind === 'tentative_hold') {\n        const leadHours",
      "if (booking.request_kind === 'tentative_hold' && booking.reassessment_required) {\n        const leadHours",
    ]],
  },
  {
    id: 'SPM159-LEAD-RECHECK-BOUNDARY',
    name: 'approval refuses a hold that is exactly 336 setup-adjusted hours away',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-03-SUP-RECHECK',
    ],
    edits: [[
      'if (leadHours < 336)\n          return {\n            kind: \'conflict\' as const,\n            reason: booking.reassessment_required',
      'if (leadHours <= 336)\n          return {\n            kind: \'conflict\' as const,\n            reason: booking.reassessment_required',
    ]],
  },
  {
    id: 'SPM159-HOLD-SUBMIT-IGNORES-APPROVED-HOLD',
    name: 'tentative-hold submission ignores another event\'s approved tentative hold when checking conflicts',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-07-SUP-APPROVED-HOLD',
    ],
    edits: [[
      "(b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $6::timestamptz)) OR\n                (b.status = 'pending' AND b.hold_expires_at > $6::timestamptz))",
      "b.request_kind <> 'tentative_hold') OR\n                (b.status = 'pending' AND b.hold_expires_at > $6::timestamptz))",
    ]],
  },
  {
    id: 'SPM159-HOLD-SUBMIT-APPROVED-HOLD-NEVER-EXPIRES',
    name: 'tentative-hold submission keeps blocking on another event\'s approved hold after it expires',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-07-SUP-APPROVED-HOLD',
    ],
    edits: [[
      "(b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $6::timestamptz)) OR\n                (b.status = 'pending' AND b.hold_expires_at > $6::timestamptz))",
      "(b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL\n                  OR true)) OR\n                (b.status = 'pending' AND b.hold_expires_at > $6::timestamptz))",
    ]],
  },
  {
    id: 'SPM159-HOLD-SUBMIT-DUPLICATE-IGNORES-EXPIRY',
    name: 'tentative-hold duplicate check keeps blocking a same-event retry after its approved hold expires',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-09-SUP-LOOKUP',
    ],
    edits: [[
      "(request_kind <> 'tentative_hold' OR hold_expires_at IS NULL\n                  OR hold_expires_at > $3::timestamptz)))\n          ORDER BY created_at DESC, id LIMIT 1",
      "(request_kind <> 'tentative_hold' OR hold_expires_at IS NULL\n                  OR true))\n          ORDER BY created_at DESC, id LIMIT 1",
    ]],
  },
  {
    id: 'SPM159-APPROVAL-EXPIRED-HOLD-BLOCKS',
    name: 'approval treats another event\'s expired approved hold as blocking',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-08-SUP-APPROVAL-EXPIRED',
    ],
    edits: [[
      "OR b.hold_expires_at > $7::timestamptz)) OR\n                (b.status = 'pending' AND\n                  (b.hold_expires_at > $7::timestamptz OR",
      "OR true)) OR\n                (b.status = 'pending' AND\n                  (b.hold_expires_at > $7::timestamptz OR",
    ]],
  },
  {
    id: 'SPM159-ORDINARY-SUBMIT-PENDING-HOLD-EXPIRY-DROPPED',
    name: 'ordinary booking submission no longer blocks on another request\'s unexpired pending hold expiry (SPM-51 AC10)',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: filters expired and exact-expiry holds while active holds remain blockers',
    ],
    edits: [[
      "                  (b.hold_expires_at > $6::timestamptz OR\n                   (b.request_kind <> 'tentative_hold' AND EXISTS (",
      "                  (false OR\n                   (b.request_kind <> 'tentative_hold' AND EXISTS (",
    ]],
  },
  {
    id: 'SPM159-STAFF-LIST-EXPIRY-BOUNDARY',
    name: 'staff list reports a hold expiring exactly now as still running',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-HOLD-09-SUP-API and VEN-HOLD-09-SUP-COORDINATOR mark an approved hold expiring',
    ],
    edits: [[
      "row.hold_expires_at <= now,\n      rejectionReason: row.rejection_reason ?? undefined,\n      reassessmentRequired",
      "row.hold_expires_at < now,\n      rejectionReason: row.rejection_reason ?? undefined,\n      reassessmentRequired",
    ]],
  },
  {
    id: 'SPM159-COORDINATOR-LIST-EXPIRY-BOUNDARY',
    name: 'coordinator list reports a hold expiring exactly now as still running',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-HOLD-09-SUP-API and VEN-HOLD-09-SUP-COORDINATOR mark an approved hold expiring',
    ],
    edits: [[
      "row.hold_expires_at <= now,\n      bookingReference: row.booking_reference,",
      "row.hold_expires_at < now,\n      bookingReference: row.booking_reference,",
    ]],
  },
  {
    id: 'SPM159-BLOCKOUT-EXPIRED-HOLD-AFFECTED',
    name: 'a venue unavailable period lists an expired approved hold as an affected booking',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-HOLD-04-SUP-BLOCKOUT reports an active approved hold as tentative and omits expired approved holds from affected bookings',
    ],
    edits: [[
      "(booking.status === 'approved' &&\n                booking.request_kind !== 'tentative_hold') ||",
      "booking.status === 'approved' ||",
    ]],
  },
  {
    id: 'SPM159-BLOCKOUT-ACTIVE-HOLD-BOOKED',
    name: 'a venue unavailable period reports a running approved hold as booked instead of tentative',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-HOLD-04-SUP-BLOCKOUT reports an active approved hold as tentative and omits expired approved holds from affected bookings',
    ],
    edits: [[
      "return booking.status === 'approved' &&\n              booking.request_kind !== 'tentative_hold'\n              ? {",
      "return booking.status === 'approved'\n              ? {",
    ]],
  },
  {
    id: 'SPM159-EVENTS-READINESS-HOLD-CONFIRMED',
    name: 'readiness treats an approved tentative hold as a confirmed venue booking',
    file: READINESS,
    suites: ['backendUnit'],
    kills: [
      'backend/src/events/status/readiness.spec.ts :: VEN-HOLD-04-SUP-EVENTS an active approved hold is outstanding as Hold and blocks Confirm',
      'backend/src/events/status/readiness.spec.ts :: VEN-HOLD-04-SUP-EVENTS an expired approved hold is outstanding as Hold expired',
    ],
    edits: [[
      'const hold = approvedHoldState(booking, now);\n    if (hold) {',
      'const hold = approvedHoldState(booking, now);\n    if (false && hold) {',
    ]],
  },
  {
    id: 'SPM159-EVENTS-HOLD-EXPIRY-BOUNDARY',
    name: 'an approved hold expiring exactly now is reported as still active across the events module',
    file: HOLD_RULE,
    suites: ['backendUnit'],
    kills: [
      'backend/src/events/venue-unavailable.spec.ts :: is active before the expiry and expired from the expiry instant',
      'backend/src/events/status/readiness.spec.ts :: VEN-HOLD-04-SUP-EVENTS an approved hold expiring exactly at the check time is expired',
    ],
    edits: [[
      'booking.holdExpiresAt.getTime() <= now.getTime()',
      'booking.holdExpiresAt.getTime() < now.getTime()',
    ]],
  },
  {
    id: 'SPM159-EVENTS-QUEUE-EXPIRED-HOLD-FLAGS-UNAVAILABLE',
    name: 'an expired approved hold still raises the queue venue-unavailable flag',
    file: QUEUE_INDICATORS,
    suites: ['backendUnit'],
    kills: [
      'backend/src/events/queue/queue-indicators.spec.ts :: VEN-HOLD-04-SUP-EVENTS does not flag an expired approved hold at an unavailable venue, but flags an active one',
    ],
    edits: [[
      "? approvedHoldState(booking, now) !== 'expired'",
      '? true',
    ]],
  },
  {
    id: 'SPM159-EVENTS-QUEUE-APPROVED-HOLD-OMITTED',
    name: 'an approved tentative hold is left out of the coordinator queue holds list',
    file: QUEUE_INDICATORS,
    suites: ['backendUnit'],
    kills: [
      'backend/src/events/queue/queue-indicators.spec.ts :: VEN-HOLD-04-SUP-EVENTS lists active and expired approved holds with their state and expiry',
    ],
    edits: [[
      "(booking.status === 'pending' || approvedHoldState(booking, now) !== null)",
      "(booking.status === 'pending')",
    ]],
  },
  {
    id: 'SPM159-PENDING-NOT-ACTIVE-ON-SUBMISSION',
    name: 'tentative hold submission persists as approved instead of Pending',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-06-A acknowledges review without claiming an active hold',
    ],
    edits: [[
      "'pending', 'tentative_hold', $5)",
      "'approved', 'tentative_hold', $5)",
    ]],
  },
  {
    id: 'SPM159-EVENT-TIME-FROM-PERSISTED-EVENT',
    name: 'tentative hold stores the current clock time instead of the persisted event start',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-10-A creates one pending hold per selected venue from persisted event times',
    ],
    edits: [[
      '[venueId, input.eventId, eventRow.start_date_time, eventRow.end_date_time, input.specialRequest ?? null]',
      '[venueId, input.eventId, this.clock.now(), eventRow.end_date_time, input.specialRequest ?? null]',
    ]],
  },
  {
    id: 'SPM159-INDEPENDENT-VENUE-REQUESTS',
    name: 'a request for one venue is treated as a duplicate for every venue of the same event',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-10-A creates one pending hold per selected venue from persisted event times',
    ],
    edits: [[
      'WHERE event_id = $1::uuid AND venue_id = $2::uuid\n            AND (status = \'pending\' OR\n              (status = \'approved\' AND\n                (request_kind <> \'tentative_hold\' OR hold_expires_at IS NULL\n                  OR hold_expires_at > $3::timestamptz)))',
      'WHERE event_id = $1::uuid\n            AND (status = \'pending\' OR\n              (status = \'approved\' AND\n                (request_kind <> \'tentative_hold\' OR hold_expires_at IS NULL\n                  OR hold_expires_at > $3::timestamptz)))',
    ]],
  },
  {
    id: 'SPM159-INELIGIBLE-REQUEST-PERSISTENCE',
    name: 'the lead-time eligibility guard accepts an ineligible direct API request',
    file: REPOSITORY,
    suites: ['backendE2E'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-HOLD-05-B rejects an ineligible direct API request without persistence',
    ],
    edits: [[
      'if (occupiedStart - this.clock.now().getTime() < 336 * 60 * 60_000)',
      'if (occupiedStart - this.clock.now().getTime() > 336 * 60 * 60_000)',
    ]],
  },
  {
    id: 'SPM159-EVENTS-SUMMARY-HOLD-CONFIRMED',
    name: 'the event venue summary shows a running approved hold under its plain confirmed name',
    file: VENUE_SUMMARY,
    suites: ['backendUnit', 'eventsE2E'],
    kills: [
      'backend/src/events/venue-summary.spec.ts :: labels an approved tentative hold (hold) or (hold expired) ahead of the confirmed label',
      'backend/test/events-approved-hold.e2e-spec.ts :: VEN-HOLD-04-SUP-EVENTS event list',
    ],
    edits: [[
      "      WHEN ${activeApprovedHoldSql('b')} THEN v.name || ' (hold)'\n",
      "",
    ]],
  },
  {
    id: 'SPM159-EVENTS-PLANNING-HOLD-BOOKED',
    name: 'the planning view labels a running approved hold Booked instead of Hold',
    file: PLANNING_REPOSITORY,
    suites: ['backendUnit', 'eventsE2E'],
    kills: [
      'backend/src/events/planning/event-planning.repository.spec.ts :: VEN-HOLD-04-SUP-EVENTS labels approved holds Hold and Hold expired and leaves expired holds out of the neighbours',
      'backend/test/events-approved-hold.e2e-spec.ts :: VEN-HOLD-04-SUP-EVENTS planning',
    ],
    edits: [[
      "                WHEN ${activeApprovedHoldSql('b')} THEN 'Hold'\n",
      "",
    ]],
  },
  {
    id: 'SPM159-EVENTS-PLANNING-EXPIRED-HOLD-NEIGHBOUR',
    name: 'an expired approved hold of another event still counts as a clashing neighbour in planning',
    file: PLANNING_REPOSITORY,
    suites: ['backendUnit', 'eventsE2E'],
    kills: [
      'backend/src/events/planning/event-planning.repository.spec.ts :: VEN-HOLD-04-SUP-EVENTS labels approved holds Hold and Hold expired and leaves expired holds out of the neighbours',
      'backend/test/events-approved-hold.e2e-spec.ts :: VEN-HOLD-04-SUP-EVENTS neighbours',
    ],
    edits: [[
      "AND ((${occupiesVenueSql('n')} AND n.event_id <> b.event_id)",
      "AND ((n.status = 'approved' AND n.event_id <> b.event_id)",
    ]],
  },
  {
    id: 'SPM159-EVENTS-SERVICE-HOLD-STATE',
    name: 'the event record never reports the latest request as a hold',
    file: EVENTS_SERVICE,
    suites: ['backendUnit', 'eventsE2E'],
    kills: [
      'backend/src/events/events.service.spec.ts :: VEN-HOLD-04-SUP-EVENTS labels an active approved hold Hold and surfaces its kind and expiry',
      'backend/test/events-approved-hold.e2e-spec.ts :: VEN-HOLD-04-SUP-EVENTS event list',
    ],
    edits: [[
      "venueHoldState: this.venueHoldLabel(row),",
      "venueHoldState: null,",
    ]],
  },
  {
    id: 'SPM159-EVENTS-READER-OMITS-REQUEST-KIND',
    name: 'the arrangements reader no longer carries the request kind, so a hold reads as a confirmed booking',
    file: ARRANGEMENTS_READER,
    suites: ['backendUnit', 'eventsE2E'],
    kills: [
      'backend/src/events/status/arrangements.reader.spec.ts :: VEN-HOLD-04-SUP-EVENTS selects and surfaces the request kind and hold expiry of each booking',
      'backend/test/events-approved-hold.e2e-spec.ts :: VEN-HOLD-04-SUP-EVENTS arrangements',
      'backend/test/events-approved-hold.e2e-spec.ts :: VEN-HOLD-04-SUP-EVENTS confirm',
    ],
    edits: [[
      "        requestKind: row.request_kind,\n",
      "",
    ]],
  },
  {
    id: 'SPM159-EVENTS-QUEUE-OMITS-REQUEST-KIND',
    name: 'the queue service no longer carries the request kind, so approved holds are missing from the holds list',
    file: QUEUE_SERVICE,
    suites: ['eventsE2E'],
    kills: [
      'backend/test/events-approved-hold.e2e-spec.ts :: VEN-HOLD-04-SUP-EVENTS queue',
    ],
    edits: [[
      "        requestKind: row.request_kind,\n",
      "",
    ]],
  },
  {
    id: 'SPM159-EVENTS-PLANNING-ACTIVE-HOLD-IGNORED',
    name: 'event planning ignores a running approved hold when assessing a change, as if it were inactive',
    file: PLANNING_SERVICE,
    suites: ['backendUnit'],
    kills: [
      'backend/src/events/planning/event-planning.service.spec.ts :: VEN-HOLD-04-SUP-EVENTS still assesses a venue booking that is an active Hold',
    ],
    edits: [[
      "  'hold expired',\n]);",
      "  'hold expired',\n  'hold',\n]);",
    ]],
  },
  {
    id: 'SPM159-EVENTS-PLANNING-EXPIRED-HOLD-ACTIVE',
    name: 'event planning still assesses an expired approved hold as if it held a venue',
    file: PLANNING_SERVICE,
    suites: ['backendUnit'],
    kills: [
      'backend/src/events/planning/event-planning.service.spec.ts :: VEN-HOLD-04-SUP-EVENTS ignores an expired Hold even when its capacity is too small',
    ],
    edits: [[
      "  'cancelled',\n  'hold expired',\n]);",
      "  'cancelled',\n]);",
    ]],
  },
];
