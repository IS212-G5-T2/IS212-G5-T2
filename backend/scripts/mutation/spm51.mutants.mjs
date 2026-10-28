// SPM-51 API and PostgreSQL mutations. Run with:
//   DATABASE_URL=... node scripts/mutation/run.mjs --mutants spm51.mutants.mjs
// Mutant IDs are stable labels for the behaviors below. The `kills` field indexes
// the exact adjacent test IDs expected to detect each mutation; this is a
// traceability aid, while only an executed run can establish a kill result.
export const SUITES = {
  unit: {
    args: [
      'run',
      'src/venues/availability/booking-request.spec.ts',
      'src/venues/availability/dto/booking-request.spec.ts',
      'src/events/events.service.spec.ts',
    ],
  },
  e2e: {
    args: [
      'run',
      '--config',
      './vitest.config.e2e.ts',
      'test/venues-booking-requests.e2e-spec.ts',
    ],
    needsEnv: ['DATABASE_URL'],
  },
  planning: {
    args: [
      'run',
      '--config',
      './vitest.config.e2e.ts',
      'test/events-planning.e2e-spec.ts',
    ],
    needsEnv: ['DATABASE_URL'],
  },
};

const DTO = 'src/venues/availability/dto/booking-request.ts';
const SERVICE = 'src/venues/venues.service.ts';
const REPOSITORY = 'src/venues/repository/venues.repository.ts';
const PLANNING_REPOSITORY = 'src/events/planning/event-planning.repository.ts';
const EVENTS_SERVICE = 'src/events/events.service.ts';

export const MUTANTS = [
  {
    id: 'B06',
    name: 'equal start and end is accepted',
    file: DTO,
    suites: ['unit', 'e2e'],
    kills: [
      'backend/src/venues/availability/dto/booking-request.spec.ts :: rejects event times with :: equal start and end',
      'backend/test/venues-booking-requests.e2e-spec.ts :: rejects equal start and end without recording a request',
    ],
    edits: [
      [
        'Date.parse(input.start) >= Date.parse(input.end)',
        'Date.parse(input.start) > Date.parse(input.end)',
      ],
    ],
  },
  {
    id: 'B07',
    name: 'non-coordinator role can submit a request',
    file: SERVICE,
    suites: ['unit', 'e2e'],
    kills: [
      'backend/src/venues/availability/booking-request.spec.ts :: rejects anonymous and non-coordinator callers before persistence',
    ],
    edits: [
      [
        "// SPM-148 PLAN-STATUS-01-D: only the Coordinator role may submit; Lead, Organiser and Attendee get 403; no token gets 401.\n    if (!identity.roles.includes('COORDINATOR'))",
        "// SPM-148 PLAN-STATUS-01-D: only the Coordinator role may submit; Lead, Organiser and Attendee get 403; no token gets 401.\n    if (false)",
      ],
    ],
  },
  {
    id: 'B08',
    name: 'event assignment predicate is omitted',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-BKG-03-SEC-2 SPM-54 rejects an unassigned Coordinator without persisting a request',
    ],
    edits: [
      [
        'FROM events WHERE id = $1::uuid AND coordinator_id = $2::text FOR UPDATE',
        'FROM events WHERE id = $1::uuid FOR UPDATE',
      ],
    ],
  },
  {
    id: 'B09',
    name: 'fresh confirmed booking conflicts do not stop persistence',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: rejects a fresh confirmed-booking conflict without persisting a request',
    ],
    edits: [
      [
        "if (conflict.rows[0])\n        return { kind: 'conflict', reason: conflict.rows[0].reason };",
        "if (false)\n        return { kind: 'conflict', reason: conflict.rows[0].reason };",
      ],
    ],
  },
  {
    id: 'B10',
    name: 'hold expiry at server now remains active',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: filters expired and exact-expiry holds while active holds remain blockers',
    ],
    edits: [
      [
        'b.hold_expires_at > $6::timestamptz',
        'b.hold_expires_at >= $6::timestamptz',
      ],
    ],
  },
  {
    id: 'B11',
    name: 'pending requests without a Venue Staff expiry are treated as active holds',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-BKG-02-B SPM-54 blocks overlap on an unbounded pending request without showing it as a schedule hold',
      'backend/test/venues-booking-requests.e2e-spec.ts :: VEN-AVL-10-A ignores a pending row without hold expiry and without a request record when an overlapping request is submitted',
    ],
    edits: [
      [
        '(b.hold_expires_at > $6::timestamptz OR EXISTS (',
        '(b.hold_expires_at IS NULL OR b.hold_expires_at > $6::timestamptz OR EXISTS (',
      ],
    ],
  },
  {
    id: 'B12-A',
    name: 'candidate setup occupancy before an existing booking is ignored',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: rejects a candidate before a booking when setup occupancy overlaps',
    ],
    edits: [
      [
        'b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz + make_interval(mins => $5::int)\n              AND b.end_at + make_interval(mins => $5::int)\n                    > $2::timestamptz - make_interval(mins => $4::int)\n         ) conflicts LIMIT 1`,\n        [\n          venueId,',
        'b.start_at\n                    < $3::timestamptz + make_interval(mins => $5::int)\n              AND b.end_at + make_interval(mins => $5::int)\n                    > $2::timestamptz - make_interval(mins => $4::int)\n         ) conflicts LIMIT 1`,\n        [\n          venueId,',
      ],
    ],
  },
  {
    id: 'B12-B',
    name: 'turnaround occupancy after a candidate is ignored for blockouts',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: rejects setup-only and turnaround-only blockout conflicts without insertion',
    ],
    edits: [
      [
        "start_at < $3::timestamptz + make_interval(mins => $5::int)\n              AND end_at > $2::timestamptz - make_interval(mins => $4::int)\n           UNION ALL\n           SELECT COALESCE(e.event_name, 'Existing venue booking') AS reason\n             FROM venue_bookings b\n             LEFT JOIN events e ON e.id = b.event_id\n            WHERE b.venue_id = $1::uuid\n",
        "start_at < $3::timestamptz\n              AND end_at > $2::timestamptz - make_interval(mins => $4::int)\n           UNION ALL\n           SELECT COALESCE(e.event_name, 'Existing venue booking') AS reason\n             FROM venue_bookings b\n             LEFT JOIN events e ON e.id = b.event_id\n            WHERE b.venue_id = $1::uuid\n",
      ],
    ],
  },
  {
    id: 'B12-C',
    name: 'setup occupancy before a candidate is ignored for blockouts',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: rejects setup-only and turnaround-only blockout conflicts without insertion',
    ],
    edits: [
      [
        "end_at > $2::timestamptz - make_interval(mins => $4::int)\n           UNION ALL\n           SELECT COALESCE(e.event_name, 'Existing venue booking') AS reason\n             FROM venue_bookings b\n             LEFT JOIN events e ON e.id = b.event_id\n            WHERE b.venue_id = $1::uuid\n",
        "end_at > $2::timestamptz\n           UNION ALL\n           SELECT COALESCE(e.event_name, 'Existing venue booking') AS reason\n             FROM venue_bookings b\n             LEFT JOIN events e ON e.id = b.event_id\n            WHERE b.venue_id = $1::uuid\n",
      ],
    ],
  },
  {
    id: 'B13',
    name: 'pending request without a Venue Staff expiry is shown as booked in event planning',
    file: PLANNING_REPOSITORY,
    suites: ['planning'],
    kills: [
      'backend/test/events-planning.e2e-spec.ts :: maps pending venue rows by explicit hold expiry and preserves approved bookings',
    ],
    edits: [
      [
        "WHEN b.status = 'pending' AND b.hold_expires_at > now() THEN 'Booked'",
        "WHEN b.status = 'pending' THEN 'Booked'",
      ],
    ],
  },
  {
    id: 'B14',
    name: 'expired tentative hold remains booked after an added expiry grace period',
    file: PLANNING_REPOSITORY,
    suites: ['planning'],
    kills: [
      'backend/test/events-planning.e2e-spec.ts :: maps pending venue rows by explicit hold expiry and preserves approved bookings',
    ],
    edits: [
      [
        'b.hold_expires_at > now()',
        "b.hold_expires_at > now() - interval '2 minutes'",
      ],
    ],
  },
  {
    id: 'B15',
    name: 'attendee branch takes precedence over the coordinator assignment list for dual-role accounts',
    file: EVENTS_SERVICE,
    suites: ['unit'],
    kills: [
      'backend/src/events/events.service.spec.ts :: scopes a coordinator-attendee list to coordinator assignments instead of attendee-visible events',
    ],
    edits: [
      [
        "const result = user.roles.includes('COORDINATOR')\n      ? await this.database.query(",
        "const result = user.roles.includes('COORDINATOR') && !user.roles.includes('ATTENDEE')\n      ? await this.database.query(",
      ],
    ],
  },
  {
    id: 'B16',
    name: 'coordinator event list omits the current coordinator_id scope filter',
    file: EVENTS_SERVICE,
    suites: ['unit'],
    kills: [
      'backend/src/events/events.service.spec.ts :: scopes a coordinator-attendee list to coordinator assignments instead of attendee-visible events',
    ],
    edits: [
      ['FROM events WHERE coordinator_id = $1 ORDER BY start_date_time ASC, created_at DESC', 'FROM events WHERE $1::text IS NOT NULL ORDER BY start_date_time ASC, created_at DESC'],
    ],
  },
  {
    id: 'B17',
    name: 'attendee-only event list is routed through coordinator assignments',
    file: EVENTS_SERVICE,
    suites: ['unit'],
    kills: [
      'backend/src/events/events.service.spec.ts :: lists attendee-viewable events with current registration availability',
    ],
    edits: [
      ["const result = user.roles.includes('COORDINATOR')\n      ? await this.database.query(", "const result = user.roles.includes('ATTENDEE')\n      ? await this.database.query("],
    ],
  },
];
