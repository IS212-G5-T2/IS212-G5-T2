export const SUITES = {
  venueRequests: {
    args: ['run', 'src/venues/repository/venues.repository.spec.ts'],
  },
  availabilityRequests: {
    args: ['run', 'src/venues/availability/booking-request.spec.ts'],
  },
  bookingDto: {
    args: ['run', 'src/venues/availability/dto/booking-request.spec.ts'],
  },
  bookingE2E: {
    args: [
      'run',
      '--config',
      './vitest.config.e2e.ts',
      'test/venues-booking-requests.e2e-spec.ts',
    ],
  },
  eventPlanningE2E: {
    args: [
      'run',
      '--config',
      './vitest.config.e2e.ts',
      'test/events-planning.e2e-spec.ts',
    ],
  },
  venueReadiness: {
    args: ['run', 'src/events/status/readiness.spec.ts'],
  },
  venueBrowse: {
    args: ['run', 'src/venues/venues.service.spec.ts'],
  },
};

const REPOSITORY = 'src/venues/repository/venues.repository.ts';
const SERVICE = 'src/venues/venues.service.ts';
const EVENT_PLANNING_REPOSITORY =
  'src/events/planning/event-planning.repository.ts';

export const MUTANTS = [
  {
    id: 'SPM54-BE-VENUE-BROWSE-AUTH',
    name: 'unauthorized users can browse venue records',
    file: SERVICE,
    suites: ['venueBrowse'],
    kills: [
      'backend/src/venues/venues.service.spec.ts :: SPM54-UI-MODE-01 allows read-only venue browsing and denies unauthorized reads',
    ],
    edits: [
      [
        "    const identity = await this.authorize(user, 'read');\n    return this.repository.list(mine ? identity.uid : undefined);",
        "    const identity = user ?? { uid: 'mutant', roles: [] };\n    return this.repository.list(mine ? identity.uid : undefined);",
      ],
    ],
  },
  {
    id: 'SPM54-BE-SUITABILITY',
    name: 'API suitability mismatches are incorrectly rejected',
    file: REPOSITORY,
    suites: ['venueRequests'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-BKG-02-B SPM-54 allows a request when attendance exceeds venue capacity',
    ],
    edits: [
      [
        '// SPM-54 AC1/AC2: suitability and capacity are advisory. Availability,',
        "if (venueRow.capacity < eventRow.expected_attendance || eventRow.required_facilities.some((item) => !venueRow.facilities.includes(item)) || eventRow.accessibility_needs.some((item) => !venueRow.accessibility.includes(item)) || (eventRow.preferred_room_layout && !venueRow.layouts.includes(eventRow.preferred_room_layout))) return { kind: 'conflict', reason: 'Venue suitability mismatch.' };\n\n      // SPM-54 AC1/AC2: suitability and capacity are advisory. Availability,",
      ],
    ],
  },
  {
    id: 'SPM54-BE-LAST-ACTIVE',
    name: 'remaining active booking causes a false last-booking warning',
    file: REPOSITORY,
    suites: ['venueRequests', 'bookingE2E'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-BKG-10-VAR-1 SPM-54 cancels one booking while another pending venue booking remains',
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-09-A VEN-BKG-09-SEC-1 VEN-BKG-10-A VEN-BKG-10-B VEN-BKG-10-SEC-1 SPM-54 cancels independently and requires explicit final-booking confirmation',
      },
    ],
    edits: [
      [
        'remaining.rows[0].count === 0 && !confirmed',
        'remaining.rows[0].count > 0 && !confirmed',
      ],
    ],
  },
  {
    id: 'SPM54-BE-VENUE-LOCK',
    name: 'distinct event requests can pass venue conflict checks without the shared venue row lock',
    file: REPOSITORY,
    suites: ['bookingE2E'],
    kills: [
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-02-C SPM-54 serializes different-event conflict checks on the venue row',
      },
    ],
    edits: [
      [
        'FROM venues v WHERE v.id = $1::uuid FOR UPDATE',
        'FROM venues v WHERE v.id = $1::uuid',
      ],
    ],
  },
  {
    id: 'SPM54-BE-INTERVAL-PREDICATE',
    name: 'a one-minute setup or turnaround overlap is omitted by the occupancy predicate',
    file: REPOSITORY,
    suites: ['bookingE2E'],
    kills: [
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-02-BND-1 SPM-54 rejects a one-minute setup overlap but accepts exact buffer adjacency',
      },
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-02-BND-2 SPM-54 rejects a one-minute turnaround overlap in PostgreSQL',
      },
    ],
    edits: [
      [
        'b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz + make_interval(mins => $5::int)',
        'b.start_at - make_interval(mins => $4::int)\n                    > $3::timestamptz + make_interval(mins => $5::int)',
      ],
    ],
  },
  {
    id: 'SPM54-BE-PENDING-REQUEST-CONFLICT',
    name: 'pending SPM-54 booking requests without hold expiry are ignored during conflict checks',
    file: REPOSITORY,
    suites: ['bookingE2E'],
    kills: [
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-02-B SPM-54 blocks overlap on an unbounded pending request without showing it as a schedule hold',
      },
    ],
    edits: [
      [
        `OR EXISTS (
                    SELECT 1 FROM venue_booking_requests r
                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id
                  )`,
        'OR false',
      ],
    ],
  },
  {
    id: 'SPM54-BE-CANCELLATION-EVENT-LOCK',
    name: 'parallel final cancellations can both pass the remaining-booking check without locking the event row',
    file: REPOSITORY,
    suites: ['bookingE2E'],
    kills: [
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-10-A VEN-BKG-10-B SPM-54 requires confirmation when concurrent cancellations target the final two bookings',
      },
    ],
    edits: [['FOR UPDATE OF b, e', 'FOR UPDATE OF b']],
  },
  {
    id: 'SPM54-BE-DUPLICATE-ACTIVE',
    name: 'an active event and venue pair is allowed to create a duplicate request',
    file: REPOSITORY,
    suites: ['venueRequests', 'bookingE2E'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-BKG-07-A SPM-54 returns the existing active request without inserting another booking',
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-07-A SPM-54 serializes duplicates and allows retries after final history statuses',
      },
    ],
    edits: [['if (activeRequest.rows[0])', 'if (false)']],
  },
  {
    id: 'SPM54-BE-FINAL-CONFIRMATION',
    name: 'explicit confirmation is ignored when cancelling the final active venue',
    file: REPOSITORY,
    suites: ['venueRequests', 'bookingE2E'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-BKG-10-A VEN-BKG-10-SEC-1 SPM-54 cancels the sole active booking after explicit confirmation',
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-09-A VEN-BKG-09-SEC-1 VEN-BKG-10-A VEN-BKG-10-B VEN-BKG-10-SEC-1 SPM-54 cancels independently and requires explicit final-booking confirmation',
      },
    ],
    edits: [
      [
        'remaining.rows[0].count === 0 && !confirmed',
        'remaining.rows[0].count === 0',
      ],
    ],
  },
  {
    id: 'SPM54-BE-EVENT-ASSIGNMENT',
    name: 'an unassigned Coordinator can continue with a booking request',
    file: 'src/venues/venues.service.ts',
    suites: ['availabilityRequests', 'bookingE2E'],
    kills: [
      'backend/src/venues/availability/booking-request.spec.ts :: VEN-BKG-03-SEC-2 SPM-54 refuses an event not assigned to the caller',
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-03-SEC-2 SPM-54 rejects an unassigned Coordinator without persisting a request',
      },
    ],
    edits: [["if (result.kind === 'event-not-assigned')", 'if (false)']],
  },
  {
    id: 'SPM54-BE-BOOKING-LIST-AUTH',
    name: 'venue staff can call the Coordinator-only booking history operation',
    file: 'src/venues/venues.service.ts',
    suites: ['availabilityRequests'],
    kills: [
      'backend/src/venues/availability/booking-request.spec.ts :: VEN-BKG-08-SEC-1 SPM-54 scopes the booking list to an authenticated Coordinator',
    ],
    edits: [
      [
        "async listCoordinatorBookings(identity: AuthenticatedUser | undefined) {\n    if (!identity?.uid)\n      throw new UnauthorizedException('Authentication required.');\n    if (!identity.roles.includes('COORDINATOR'))",
        "async listCoordinatorBookings(identity: AuthenticatedUser | undefined) {\n    if (!identity?.uid)\n      throw new UnauthorizedException('Authentication required.');\n    if (false)",
      ],
    ],
  },
  {
    id: 'SPM54-BE-OPTIONAL-REQUEST',
    name: 'a blank optional special request is persisted as a nonempty value',
    file: 'src/venues/availability/dto/booking-request.ts',
    suites: ['bookingDto'],
    kills: [
      'backend/src/venues/availability/dto/booking-request.spec.ts :: VEN-BKG-03-A VEN-BKG-03-B SPM-54 accepts a trimmed or blank optional special request',
    ],
    edits: [
      [
        "typeof input.specialRequest === 'string' && input.specialRequest.trim()",
        "typeof input.specialRequest === 'string'",
      ],
    ],
  },
  {
    id: 'SPM54-BE-ASSIGNED-EVENT-TIME',
    name: 'client-supplied times override the assigned event period',
    file: REPOSITORY,
    suites: ['venueRequests'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-BKG-03-SEC-1 SPM-54 derives the booking period from the assigned event',
    ],
    edits: [
      [
        '[\n          venueId,\n          input.eventId,\n          eventRow.start_date_time,\n          eventRow.end_date_time,\n        ],',
        '[\n          venueId,\n          input.eventId,\n          input.start,\n          input.end,\n        ],',
      ],
    ],
  },
  {
    id: 'SPM54-BE-AC11-BLOCKOUT-SETUP',
    name: 'a blockout inside the setup buffer is treated as usable',
    file: EVENT_PLANNING_REPOSITORY,
    suites: ['eventPlanningE2E'],
    kills: [
      {
        suite: 'eventPlanningE2E',
        file: 'test/events-planning.e2e-spec.ts',
        title:
          'VEN-BKG-11-VAR-1 projects setup and turnaround blockouts but ignores non-overlapping blockouts through the planning HTTP endpoint',
      },
    ],
    edits: [
      [
        'AND blockout.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)',
        'AND blockout.end_at > b.start_at',
      ],
    ],
  },
  {
    id: 'SPM54-BE-AC11-BLOCKOUT-TURNAROUND',
    name: 'a blockout inside the turnaround buffer is treated as usable',
    file: EVENT_PLANNING_REPOSITORY,
    suites: ['eventPlanningE2E'],
    kills: [
      {
        suite: 'eventPlanningE2E',
        file: 'test/events-planning.e2e-spec.ts',
        title:
          'VEN-BKG-11-VAR-1 projects setup and turnaround blockouts but ignores non-overlapping blockouts through the planning HTTP endpoint',
      },
    ],
    edits: [
      [
        'AND blockout.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)',
        'AND blockout.start_at < b.end_at',
      ],
    ],
  },
  {
    id: 'SPM54-BE-AC11-BLOCKOUT-INTERSECTION',
    name: 'a non-overlapping blockout makes an approved booking unavailable',
    file: EVENT_PLANNING_REPOSITORY,
    suites: ['eventPlanningE2E'],
    kills: [
      {
        suite: 'eventPlanningE2E',
        file: 'test/events-planning.e2e-spec.ts',
        title:
          'VEN-BKG-11-VAR-1 projects setup and turnaround blockouts but ignores non-overlapping blockouts through the planning HTTP endpoint',
      },
    ],
    edits: [
      [
        'AND blockout.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)\n                     AND blockout.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)',
        'AND blockout.start_at IS NOT NULL AND blockout.end_at IS NOT NULL',
      ],
    ],
  },
  {
    id: 'SPM54-BE-MY-BOOKINGS-SETUP-BUFFER',
    name: 'a setup-only blockout does not mark the original My Bookings row affected',
    file: REPOSITORY,
    suites: ['bookingE2E'],
    kills: [
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-06-A SPM-54 marks a setup-buffer-only blockout as affecting the original booking and preserves replacement context',
      },
    ],
    edits: [
      [
        'AND blockout.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)) AS affected',
        'AND blockout.end_at > b.start_at) AS affected',
      ],
    ],
  },
  {
    id: 'SPM54-BE-MY-BOOKINGS-TURNAROUND-BUFFER',
    name: 'a turnaround-only blockout does not mark the original My Bookings row affected',
    file: REPOSITORY,
    suites: ['bookingE2E'],
    kills: [
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-06-A SPM-54 marks a turnaround-buffer-only blockout as affecting the original booking and preserves replacement context',
      },
    ],
    edits: [
      [
        'AND blockout.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)\n                  AND blockout.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)) AS affected',
        'AND blockout.start_at < b.end_at\n                  AND blockout.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)) AS affected',
      ],
    ],
  },
  {
    id: 'SPM54-BE-SCHEDULE-CONFLICT',
    name: 'a conflicting venue period is ignored and a request is written anyway',
    file: REPOSITORY,
    suites: ['venueRequests', 'bookingE2E'],
    kills: [
      'backend/src/venues/repository/venues.repository.spec.ts :: VEN-BKG-02-D SPM-54 reports an operational unavailability blocker',
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-05-A VEN-BKG-05-B VEN-BKG-06-A VEN-BKG-07-A VEN-BKG-07-B SPM-54 supports replacement while preserving independent booking history',
      },
    ],
    edits: [['if (conflict.rows[0])', 'if (false)']],
  },
  {
    id: 'SPM54-BE-BOOKING-REFERENCE',
    name: 'booking confirmation exposes an invalid reference for the persisted request',
    file: 'src/venues/venues.service.ts',
    suites: ['availabilityRequests', 'bookingE2E'],
    kills: [
      {
        suite: 'bookingE2E',
        file: 'test/venues-booking-requests.e2e-spec.ts',
        title:
          'VEN-BKG-04-A SPM-54 creates a pending request with a reference in My Bookings',
      },
    ],
    edits: [
      [
        "bookingReference: `VB-${result.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`",
        'bookingReference: `VB-INVALID`',
      ],
    ],
  },
  {
    id: 'SPM54-BE-CANCELLED-READINESS',
    name: 'a cancelled venue request continues to block event readiness',
    file: 'src/events/status/readiness.ts',
    suites: ['venueReadiness'],
    kills: [
      'backend/src/events/status/readiness.spec.ts :: SPM-54 treats a cancelled-only venue history as no active booking',
    ],
    edits: [
      [
        "booking.status !== 'released' && booking.status !== 'cancelled'",
        "booking.status !== 'released'",
      ],
    ],
  },
];
