// SPM-56 approval-conflict predicate fault injection.
export const SUITES = {
  unitShape: {
    args: ['run', 'src/venues/repository/venues.repository.spec.ts', 'src/venues/venues.service.spec.ts'],
  },
  unitReassessmentMissing: { args: ['run', 'src/venues/repository/venues.repository.spec.ts'] },
  unitReassessmentLead: { args: ['run', 'src/venues/repository/venues.repository.spec.ts'] },
  unitService: { args: ['run', 'src/venues/venues.service.spec.ts'] },
  conflictE2E: {
    args: ['run', '--config', 'vitest.config.e2e.ts', 'test/venues-booking-requests.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const REPOSITORY = 'src/venues/repository/venues.repository.ts';
const suite = ['conflictE2E'];
const e2eKill = (title) => `backend/test/venues-booking-requests.e2e-spec.ts :: ${title}`;

export const MUTANTS = [
  { id: 'SPM56-BE-01', name: 'approved ordinary bookings and active holds are not scoped to the candidate venue', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-01-B VEN-CONF-01-SEC-1 VEN-CONF-06-E SPM-56 isolates venues and reports the raw unavailable interval')], edits: [["WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid", "WHERE b.id <> $6::uuid"]] },
  { id: 'SPM56-BE-02', name: 'pending hold requests become approval blockers', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-02-B VEN-CONF-04-B SPM-56 approves when only a pending hold and other-venue booking overlap')], edits: [["AND b.status = 'approved'\n              AND (b.request_kind = 'booking' OR\n                (b.request_kind = 'tentative_hold'\n                  AND b.hold_expires_at > $7::timestamptz))", "AND ((b.status = 'approved' AND (b.request_kind = 'booking' OR\n                (b.request_kind = 'tentative_hold'\n                  AND b.hold_expires_at > $7::timestamptz))) OR\n                   (b.status = 'pending' AND b.request_kind = 'tentative_hold'))"]] },
  { id: 'SPM56-BE-03', name: 'approved ordinary bookings stop blocking while active holds continue to block', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-01-A VEN-CONF-01-SEC-1 VEN-CONF-02-A VEN-CONF-02-C SPM-56 rejects approval against a newly approved occupied interval')], edits: [["b.request_kind = 'booking' OR", "b.request_kind = 'booking' AND b.status = 'pending' OR"]] },
  { id: 'SPM56-BE-04', name: 'expired tentative holds remain active blockers at decision time', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-04-A VEN-CONF-05-A VEN-CONF-05-B VEN-CONF-05-BND-1 VEN-CONF-05-C SPM-56 distinguishes active and expired holds from ordinary bookings')], edits: [['b.hold_expires_at > $7::timestamptz', 'b.hold_expires_at >= $7::timestamptz']] },
  { id: 'SPM56-BE-05', name: 'setup and turnaround are applied to the wrong sides of the occupied window', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-03-A VEN-CONF-03-B SPM-56 detects setup-only and turnaround-only conflicts')], edits: [["AND (b.request_kind = 'booking' OR\n                (b.request_kind = 'tentative_hold'\n                  AND b.hold_expires_at > $7::timestamptz))\n              AND b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz", "AND (b.request_kind = 'booking' OR\n                (b.request_kind = 'tentative_hold'\n                  AND b.hold_expires_at > $7::timestamptz))\n              AND b.start_at - make_interval(mins => $5::int)\n                    < $3::timestamptz"]] },
  { id: 'SPM56-BE-06', name: 'turnaround no longer expands the existing occupied interval', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-03-A VEN-CONF-03-B SPM-56 detects setup-only and turnaround-only conflicts')], edits: [["AND b.status = 'approved'\n              AND (b.request_kind = 'booking' OR\n                (b.request_kind = 'tentative_hold'\n                  AND b.hold_expires_at > $7::timestamptz))\n              AND b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz + make_interval(mins => $5::int)\n              AND b.end_at + make_interval(mins => $5::int)\n                    > $2::timestamptz", "AND b.status = 'approved'\n              AND (b.request_kind = 'booking' OR\n                (b.request_kind = 'tentative_hold'\n                  AND b.hold_expires_at > $7::timestamptz))\n              AND b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz + make_interval(mins => $5::int)\n              AND b.end_at\n                    > $2::timestamptz"]] },
  { id: 'SPM56-BE-07', name: 'unavailable interval is padded as though it were an event', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-01-B VEN-CONF-01-SEC-1 VEN-CONF-06-E SPM-56 isolates venues and reports the raw unavailable interval')], edits: [['start_at AS occupied_start, end_at AS occupied_end', 'start_at - make_interval(mins => $4::int) AS occupied_start, end_at + make_interval(mins => $5::int) AS occupied_end']] },
  { id: 'SPM56-BE-08', name: 'pending tentative holds block a newly submitted booking request', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-04-C SPM-56 accepts a booking request beside a pending tentative hold')], edits: [["b.status = 'pending' AND b.request_kind <> 'tentative_hold' AND", "b.status = 'pending' AND (b.request_kind <> 'tentative_hold' OR b.request_kind = 'tentative_hold') AND"]] },
  { id: 'SPM56-BE-09', name: 'venue row locking is removed from approval decisions', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-04-D VEN-CONF-04-PERF-1 SPM-56 allows only one concurrent overlapping hold approval')], edits: [["SELECT setup_time_minutes, turnaround_time_minutes FROM venues\n        WHERE id = $1::uuid FOR UPDATE", "SELECT setup_time_minutes, turnaround_time_minutes FROM venues\n        WHERE id = $1::uuid"]] },
  { id: 'SPM56-BE-10', name: 'active approved tentative holds stop blocking sequential approvals', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-04-D SPM-56 refuses a second sequential overlapping hold approval')], edits: [["b.status = 'approved'\n              AND (b.request_kind = 'booking' OR\n                (b.request_kind = 'tentative_hold'\n                  AND b.hold_expires_at > $7::timestamptz))", "b.status = 'approved'\n              AND (b.request_kind = 'booking' OR\n                (b.request_kind = 'tentative_hold'\n                  AND FALSE))"]] },
  { id: 'SPM56-BE-11', name: 'touching occupied endpoints are treated as overlapping', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-01-BND-1 VEN-CONF-03-BND-1 SPM-56 allows exactly touching occupied endpoints')], edits: [["WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid\n              AND b.status = 'approved'\n              AND (b.request_kind = 'booking' OR\n                (b.request_kind = 'tentative_hold'\n                  AND b.hold_expires_at > $7::timestamptz))\n              AND b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz + make_interval(mins => $5::int)\n              AND b.end_at + make_interval(mins => $5::int)\n                    > $2::timestamptz - make_interval(mins => $4::int)", "WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid\n              AND b.status = 'approved'\n              AND (b.request_kind = 'booking' OR\n                (b.request_kind = 'tentative_hold'\n                  AND b.hold_expires_at > $7::timestamptz))\n              AND b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz + make_interval(mins => $5::int)\n              AND b.end_at + make_interval(mins => $5::int)\n                    >= $2::timestamptz - make_interval(mins => $4::int)"]] },
  { id: 'SPM56-BE-12', name: 'approval uses zero setup time instead of the venue current setup buffer', file: REPOSITORY, suites: suite, kills: [e2eKill('VEN-CONF-03-VAR-1 SPM-56 rechecks against the current setup buffer')], edits: [["SELECT setup_time_minutes, turnaround_time_minutes FROM venues\n        WHERE id = $1::uuid FOR UPDATE", "SELECT 0 AS setup_time_minutes, turnaround_time_minutes FROM venues\n        WHERE id = $1::uuid FOR UPDATE"]] },
];

// These unit-level mutations exercise SQL-shape assertions only. Keep them
// separate from the PostgreSQL behavioral mutants so their results are never
// mistaken for database-backed evidence.
const unitShapeMutants = MUTANTS.filter((mutant) => /^SPM56-BE-0[1-7]$/.test(mutant.id)).map((mutant) => ({
  ...mutant,
  id: mutant.id.replace('SPM56-BE-', 'SPM56-BEU-'),
  name: `${mutant.name} (SQL shape only)`,
  suites: ['unitShape'],
  kills: [`backend/src/venues/repository/venues.repository.spec.ts :: VEN-CONF-01-A VEN-CONF-03-A VEN-CONF-06-A VEN-CONF-06-C VEN-CONF-06-E SPM-56 returns each blocker with its correct interval`],
}));
MUTANTS.push(...unitShapeMutants);
MUTANTS.push(
  {
    id: 'SPM56-BER-01',
    name: 'a missing event start no longer fails hold reassessment lead time',
    file: REPOSITORY,
    suites: ['unitReassessmentMissing'],
    kills: ['backend/src/venues/repository/venues.repository.spec.ts :: VEN-CONF-04-D SPM-56 leaves a reassessed hold pending when its event start is unavailable'],
    edits: [[': Number.NEGATIVE_INFINITY;', ': 336;']],
  },
  {
    id: 'SPM56-BER-02',
    name: 'sufficient reassessment lead time is incorrectly rejected',
    file: REPOSITORY,
    suites: ['unitReassessmentLead'],
    kills: ['backend/src/venues/repository/venues.repository.spec.ts :: VEN-CONF-04-D SPM-56 rechecks a reassessed hold when its lead time remains sufficient'],
    edits: [['if (leadHours < 336)', 'if (leadHours > 336)']],
  },
  {
    id: 'SPM56-BES-01',
    name: 'approval conflict details are dropped from the HTTP error',
    file: 'src/venues/venues.service.ts',
    suites: ['unitService'],
    kills: ['backend/src/venues/venues.service.spec.ts :: VEN-CONF-02-A SPM-56 includes conflicting occupied periods in the approval error'],
    edits: [['conflicts: result.conflicts,', 'conflicts: [],']],
  },
);
