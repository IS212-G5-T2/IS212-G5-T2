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

export const MUTANTS = [
  {
    id: 'B06',
    name: 'equal start and end is accepted',
    file: DTO,
    suites: ['unit', 'e2e'],
    kills: [
      'backend/src/venues/availability/dto/booking-request.spec.ts :: rejects event times with equal start and end',
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
    edits: [["if (!identity.roles.includes('COORDINATOR'))", 'if (false)']],
  },
  {
    id: 'B08',
    name: 'event assignment predicate is omitted',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: rejects an unassigned coordinator without persisting a request',
    ],
    edits: [
      [
        "'SELECT id FROM events WHERE id = $1::uuid AND coordinator_id = $2::text FOR SHARE'",
        "'SELECT id FROM events WHERE id = $1::uuid FOR SHARE'",
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
      'backend/test/venues-booking-requests.e2e-spec.ts :: filters expired and exact-expiry holds from the API while active holds remain blockers',
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
      'backend/test/venues-booking-requests.e2e-spec.ts :: keeps a pending request without expiry out of holds and conflict checks',
    ],
    edits: [
      [
        "(b.status = 'pending' AND b.hold_expires_at > $6::timestamptz)",
        "b.status = 'pending'",
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
        'b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz',
        'b.start_at\n                    < $3::timestamptz',
      ],
    ],
  },
  {
    id: 'B12-B',
    name: 'turnaround occupancy after a candidate is ignored for blockouts',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: rejects setup-only and turnaround-only blockout conflicts without recording either request :: turnaround blockout row',
    ],
    edits: [
      [
        'start_at < $3::timestamptz + make_interval(mins => $5::int)',
        'start_at < $3::timestamptz',
      ],
    ],
  },
  {
    id: 'B12-C',
    name: 'setup occupancy before a candidate is ignored for blockouts',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: [
      'backend/test/venues-booking-requests.e2e-spec.ts :: rejects setup-only and turnaround-only blockout conflicts without recording either request :: setup blockout row',
    ],
    edits: [
      [
        'end_at > $2::timestamptz - make_interval(mins => $4::int)',
        'end_at > $2::timestamptz',
      ],
    ],
  },
  {
    id: 'B13',
    name: 'pending request without a Venue Staff expiry is shown as booked in event planning',
    file: PLANNING_REPOSITORY,
    suites: ['planning'],
    kills: [
      'backend/test/events-planning.e2e-spec.ts :: maps pending venue rows by explicit hold expiry and preserves approved bookings :: unbounded row',
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
      'backend/test/events-planning.e2e-spec.ts :: maps pending venue rows by explicit hold expiry and preserves approved bookings :: expired row',
    ],
    edits: [
      [
        'b.hold_expires_at > now()',
        "b.hold_expires_at > now() - interval '2 minutes'",
      ],
    ],
  },
];
