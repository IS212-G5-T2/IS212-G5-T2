// SPM-133 backend mutants (Hold expires and releases venue — Venue Staff), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm133.mutants.mjs            # needs DATABASE_URL
// Each edit is [from, to]; `from` must occur exactly once in the file.
// M1–M5 target the expiry business rules in venues.repository.ts (AC2, AC4, AC6).
export const SUITES = {
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/tentative-hold-expiry.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const REPO = 'src/venues/repository/venues.repository.ts';

export const MUTANTS = [
  { id: 'M1', name: 'expiry boundary weakened: <= changed to < in processExpiredTentativeHolds — hold at equality not expired (AC6 BND)', file: REPO,
    edits: [['AND hold_expires_at <= $1::timestamptz AND hold_expiry_processed_at IS NULL', 'AND hold_expires_at < $1::timestamptz AND hold_expiry_processed_at IS NULL']],
    suites: ['e2e'] },
  { id: 'M2', name: 'idempotency guard removed: hold_expiry_processed_at IS NULL dropped (equivalent: UPDATE atomically sets status=expired so status=approved filter already prevents re-processing on second run)', file: REPO,
    edits: [['AND hold_expires_at <= $1::timestamptz AND hold_expiry_processed_at IS NULL', 'AND hold_expires_at <= $1::timestamptz']],
    suites: ['e2e'],
    // Equivalent: the processor UPDATE also sets status='expired'. On the second run, the
    // status='approved' filter already prevents re-matching — hold_expiry_processed_at IS NULL
    // is structurally redundant when both conditions are always written atomically together.
    equivalent: true },
  { id: 'M3', name: 'request_kind filter removed from processor (equivalent: convertTentativeHold sets hold_expires_at=NULL so hold_expires_at<=now evaluates NULL/false for converted rows)', file: REPO,
    edits: [["WHERE request_kind = 'tentative_hold' AND status = 'approved'", "WHERE status = 'approved'"]],
    suites: ['e2e'],
    // Equivalent: convertTentativeHold sets hold_expires_at = NULL (line 873 of venues.repository.ts).
    // After conversion, the processor's hold_expires_at <= $1 clause evaluates to NULL (false) in SQL,
    // so converted bookings are never matched regardless of the request_kind filter.
    equivalent: true },
  { id: 'M4', name: 'convert-hold expiry check weakened: <= changed to < — hold at equality can still be converted (AC4 BND)', file: REPO,
    edits: [['if (!expiry || expiry.getTime() <= now.getTime())', 'if (!expiry || expiry.getTime() < now.getTime())']],
    suites: ['e2e'] },
  { id: 'M5', name: 'booking-request blocker weakened: hold_expires_at > changed to >= — hold at equality still blocks new requests (AC2 BND)', file: REPO,
    // Targets the createBookingRequest conflict check (lines 1073-1081) — the approved-hold
    // expiry boundary that lets equality be treated as expired (non-blocking).
    edits: [['OR b.hold_expires_at > $6::timestamptz)) OR\n                (b.status = \'pending\' AND\n                  (b.hold_expires_at > $6::timestamptz OR',
             'OR b.hold_expires_at >= $6::timestamptz)) OR\n                (b.status = \'pending\' AND\n                  (b.hold_expires_at >= $6::timestamptz OR']],
    suites: ['e2e'] },
];
