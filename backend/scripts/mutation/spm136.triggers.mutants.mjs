// SPM-136 trigger mutants: the release-skip branches of the venue_bookings and equipment_reservations safety
// triggers, redefined by database/postgresql/init/017_spm136_cancel_event.sql. Run by run-triggers.mjs:
//   node scripts/mutation/run-triggers.mjs --mutants spm136.triggers.mutants.mjs
//   node scripts/mutation/run-triggers.mjs --mutants spm136.triggers.mutants.mjs --only TR-T1
// The same text lives in backend/migrations/011_spm136_cancel_event.sql, which the SPM-136 suites re-apply to the
// shared database in their beforeAll. Each mutant therefore also edits that migration COPY (backendEdits), so the
// re-apply cannot undo the mutant. Only copies are edited; the repository files are never changed.
//
// Without the branch, a release (UPDATE to 'released' / 'Released') runs invalidate_safety_check: the safety row,
// its feedback items and a reset row are removed or written. CANCEL-EVENT-04-A (safety) in
// test/events-cancel.e2e-spec.ts asserts those rows are unchanged.
export const SUITES = {
  cancel: {
    args: [
      'run', '--config', './vitest.config.e2e.ts',
      'test/events-cancel.e2e-spec.ts', 'test/events-cancelled-guard.e2e-spec.ts',
    ],
  },
};

const TRIGGER_SQL = '017_spm136_cancel_event.sql';
const MIGRATION = 'migrations/011_spm136_cancel_event.sql';
const VENUE_SKIP = "  IF TG_OP = 'UPDATE' AND NEW.status = 'released' AND OLD.status <> 'released' THEN\n    RETURN NEW;\n  END IF;\n";
const EQUIPMENT_SKIP = "  IF TG_OP = 'UPDATE' AND NEW.status = 'Released' AND OLD.status <> 'Released' THEN\n    RETURN NEW;\n  END IF;\n";

export const TRIGGER_MUTANTS = [
  { id: 'TR-T1', name: 'venue release no longer skips the safety reset (release-skip branch removed)', file: TRIGGER_SQL,
    edits: [[VENUE_SKIP, '']], backendEdits: [{ file: MIGRATION, edits: [[VENUE_SKIP, '']] }], suites: ['cancel'] },
  { id: 'TR-T2', name: 'equipment release no longer skips the safety reset (release-skip branch removed)', file: TRIGGER_SQL,
    edits: [[EQUIPMENT_SKIP, '']], backendEdits: [{ file: MIGRATION, edits: [[EQUIPMENT_SKIP, '']] }], suites: ['cancel'] },
];
