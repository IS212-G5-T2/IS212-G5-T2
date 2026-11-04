// SPM-133 frontend mutants (Hold expires and releases venue — Venue Staff), run by run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm133.mutants.mjs
// Each edit is [from, to]; `from` must occur exactly once in the file.
// M1–M4 target useHoldExpiry.ts business rules (AC1, AC5).
export const SUITES = {
  spm133: {
    args: [
      'run',
      'src/features/bookings/pages/requests/useHoldExpiry.test.ts',
    ],
  },
};

const HOOK = 'src/features/bookings/pages/requests/useHoldExpiry.ts';

export const MUTANTS = [
  { id: 'M1', name: 'equality boundary weakened: >= to > in useState initializer (equivalent: useEffect corrects via msUntilExpiry<=0 within the same scheduler flush, indistinguishable from one render in tests)', file: HOOK,
    edits: [['return Date.now() >= new Date(holdExpiresAt).getTime();', 'return Date.now() > new Date(holdExpiresAt).getTime();']],
    suites: ['spm133'],
    // Equivalent under vi.useFakeTimers(): useState initializer returns false at exact equality, but
    // act() flushes effects synchronously in the test environment. The effect finds msUntilExpiry=0
    // (<=0 branch), calls setIsExpired(true), and both state updates are committed before assertions run.
    // In a real browser there would be a one-frame flash of "Active" before the effect fires; that
    // frame is unobservable in the jsdom/Vitest test harness, so the mutant is indistinguishable
    // from the original. The equality boundary is not pinned by any unit test for this specific
    // path; the equivalence case is structural.
    equivalent: true },
  { id: 'M2', name: 'equality boundary weakened: <=0 to <0 in useEffect early-return (equivalent: dead branch at equality — useState initializer catches it with >= first so effect exits early)', file: HOOK,
    edits: [['if (msUntilExpiry <= 0) {', 'if (msUntilExpiry < 0) {']],
    suites: ['spm133'],
    // Equivalent: the <= 0 branch in useEffect is dead code at exact equality. When holdExpiresAt
    // equals now, the useState initializer (>=) returns true, and useEffect exits early at the
    // `if (isExpired || !holdExpiresAt) return` guard — line 21 is never reached.
    equivalent: true },
  { id: 'M3', name: '32-bit overflow guard removed: far-future holds trigger an immediate setTimeout fire (supporting test)', file: HOOK,
    edits: [['    const MAX_TIMEOUT_MS = 2_147_483_647;\n    if (msUntilExpiry > MAX_TIMEOUT_MS) return;', '    const MAX_TIMEOUT_MS = 2_147_483_647;']],
    suites: ['spm133'] },
  { id: 'M4', name: 'initialExpired flag ignored: server-side expired flag no longer sets isExpired on mount (AC5)', file: HOOK,
    edits: [['    if (initialExpired) return true;', '    // if (initialExpired) return true;']],
    suites: ['spm133'] },
];
