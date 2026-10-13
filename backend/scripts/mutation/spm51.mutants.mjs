// SPM-51 API and PostgreSQL mutations. Run with:
//   DATABASE_URL=... node scripts/mutation/run.mjs --mutants spm51.mutants.mjs
// B06-B12 map request boundaries, role/assignment authorization, persisted conflicts,
// hold lifecycle, and setup/turnaround occupancy to the adjacent SPM-51/VEN-AVL tests.
export const SUITES = {
  unit: {
    args: [
      'run',
      'src/venues/availability/booking-request.spec.ts',
      'src/venues/availability/dto/booking-request.spec.ts',
    ],
  },
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/venues-booking-requests.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const DTO = 'src/venues/availability/dto/booking-request.ts';
const SERVICE = 'src/venues/venues.service.ts';
const REPOSITORY = 'src/venues/repository/venues.repository.ts';

export const MUTANTS = [
  { id: 'B06', name: 'equal start and end is accepted', file: DTO, suites: ['unit', 'e2e'],
    edits: [['Date.parse(input.start) >= Date.parse(input.end)', 'Date.parse(input.start) > Date.parse(input.end)']] },
  { id: 'B07', name: 'non-coordinator role can submit a request', file: SERVICE, suites: ['unit', 'e2e'],
    edits: [["if (!identity.roles.includes('COORDINATOR'))", 'if (false)']] },
  { id: 'B08', name: 'event assignment predicate is omitted', file: REPOSITORY, suites: ['e2e'],
    edits: [["'SELECT id FROM events WHERE id = $1::uuid AND coordinator_id = $2::text FOR SHARE'", "'SELECT id FROM events WHERE id = $1::uuid FOR SHARE'"]] },
  { id: 'B09', name: 'fresh confirmed booking conflicts do not stop persistence', file: REPOSITORY, suites: ['e2e'],
    edits: [['if (conflict.rows[0])\n        return { kind: \'conflict\', reason: conflict.rows[0].reason };', 'if (false)\n        return { kind: \'conflict\', reason: conflict.rows[0].reason };']] },
  { id: 'B10', name: 'hold expiry at server now remains active', file: REPOSITORY, suites: ['e2e'],
    edits: [["b.hold_expires_at > $6::timestamptz", "b.hold_expires_at >= $6::timestamptz"]] },
  { id: 'B11', name: 'pending requests without a Venue Staff expiry are treated as active holds', file: REPOSITORY, suites: ['e2e'],
    edits: [["(b.status = 'pending' AND b.hold_expires_at > $6::timestamptz)", "b.status = 'pending'"]] },
  { id: 'B12-A', name: 'candidate setup occupancy before an existing booking is ignored', file: REPOSITORY, suites: ['e2e'],
    edits: [['b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz', 'b.start_at\n                    < $3::timestamptz']] },
  { id: 'B12-B', name: 'turnaround occupancy after a candidate is ignored for blockouts', file: REPOSITORY, suites: ['e2e'],
    edits: [['start_at < $3::timestamptz + make_interval(mins => $5::int)', 'start_at < $3::timestamptz']] },
  { id: 'B12-C', name: 'setup occupancy before a candidate is ignored for blockouts', file: REPOSITORY, suites: ['e2e'],
    edits: [['end_at > $2::timestamptz - make_interval(mins => $4::int)', 'end_at > $2::timestamptz']] },
];
