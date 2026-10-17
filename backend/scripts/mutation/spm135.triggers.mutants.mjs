// SPM-135 trigger mutants: the venue_bookings and equipment_reservations safety-reset triggers and
// invalidate_safety_check, which live in database/postgresql/init (not in backend/). Run by run-triggers.mjs:
//   node scripts/mutation/run-triggers.mjs                       # every trigger mutant (needs DATABASE_URL)
//   node scripts/mutation/run-triggers.mjs --only TG1,TG5
//   node scripts/mutation/run-triggers.mjs --list
// Each edit is [from, to]; `from` must occur exactly once in the copied file (otherwise MISAPPLIED).
// Each mutant rewrites a COPY of the init script in a temp directory, loads the whole init set into a fresh
// scratch database (spm_mutant_<random>), runs the suites against it, and drops that database in a finally
// block. Nothing under database/ or the shared spm_test / spm_manual databases is changed.
//
// The live definitions are the ones in 016_spm135_safety_reset_reason.sql: it runs after 014 and replaces the
// same functions with CREATE OR REPLACE, so the mutants target 016. A mutant in 014 would be superseded and
// equivalent by construction.
//
// `equivalent: true` is a claim that the survivor cannot change observable behaviour; the reason is given in
// the mutant's name and must be backed by evidence (see the TG7 note).
export const SUITES = {
  // Venue and equipment removal through HTTP: the reset reason and the reset of an approved check.
  removal: {
    args: [
      'run', '--config', './vitest.config.e2e.ts',
      'test/events-venue-removal.e2e-spec.ts', 'test/events-equipment-removal.e2e-spec.ts',
    ],
  },
  // Booking and equipment changes made directly in SQL (the triggers), reset reasons, leftover feedback.
  safetyInvalidation: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-safety-invalidation.e2e-spec.ts'],
  },
};

const RESET_SQL = '016_spm135_safety_reset_reason.sql';
const VENUE_DELETE_RESET = "IF OLD.event_id IS NOT NULL THEN PERFORM invalidate_safety_check(OLD.event_id, 'The venue booking changed'); END IF;";
const EQUIPMENT_DELETE_RESET = "PERFORM invalidate_safety_check(OLD.event_id, 'The equipment request changed');";
const FUNCTION_START = '  DELETE FROM safety_check_feedback_items WHERE event_id = p_event_id;\n  IF EXISTS';
const GUARD = 'IF EXISTS (SELECT 1 FROM event_safety_checks WHERE event_id = p_event_id) THEN';
const both = ['removal', 'safetyInvalidation'];

export const TRIGGER_MUTANTS = [
  { id: 'TG1', name: 'venue DELETE reset reason text changed ("The venue booking was removed")', file: RESET_SQL,
    edits: [[VENUE_DELETE_RESET, VENUE_DELETE_RESET.replace("'The venue booking changed'", "'The venue booking was removed'")]],
    suites: both },
  { id: 'TG2', name: 'equipment DELETE reset reason text changed ("The equipment request was removed")', file: RESET_SQL,
    edits: [[EQUIPMENT_DELETE_RESET, EQUIPMENT_DELETE_RESET.replace("'The equipment request changed'", "'The equipment request was removed'")]],
    suites: both },
  { id: 'TG3', name: 'venue DELETE path does not invalidate (returns early after the delete)', file: RESET_SQL,
    edits: [[VENUE_DELETE_RESET, 'NULL;']],
    suites: both },
  { id: 'TG4', name: 'equipment DELETE path does not invalidate (returns early after the delete)', file: RESET_SQL,
    edits: [[EQUIPMENT_DELETE_RESET, 'NULL;']],
    suites: both },
  { id: 'TG5', name: 'invalidate_safety_check does nothing when the event has no safety row (leftover feedback kept)', file: RESET_SQL,
    edits: [[FUNCTION_START, '  IF NOT EXISTS (SELECT 1 FROM event_safety_checks WHERE event_id = p_event_id) THEN RETURN; END IF;\n  DELETE FROM safety_check_feedback_items WHERE event_id = p_event_id;\n  IF EXISTS']],
    suites: both },
  { id: 'TG6', name: 'invalidate_safety_check guard inverted (a reset is recorded when there was no safety row, and the real one is skipped)', file: RESET_SQL,
    edits: [[GUARD, GUARD.replace('IF EXISTS', 'IF NOT EXISTS')]],
    suites: both },
  // Equivalent: the OLD.event_id guard only matters when a venue booking with NULL event_id is deleted. That is
  // a blocked window row (venue_bookings_kind_check forces event_id NULL exactly for blocked rows). Without the
  // guard, invalidate_safety_check(NULL, reason) runs, and both of its statements compare event_id with NULL:
  // `DELETE ... WHERE event_id = NULL` matches no row, and `EXISTS (... WHERE event_id = NULL)` is false, so
  // no safety row is touched and no reset row is written. The function therefore does nothing for a NULL
  // event, with or without the guard. The scratch run of this mutant reported no change in any suite result.
  { id: 'TG7', name: 'OLD.event_id IS NOT NULL guard removed from the venue DELETE branch (equivalent: a NULL event_id makes invalidate_safety_check a no-op)', file: RESET_SQL, equivalent: true,
    edits: [[VENUE_DELETE_RESET, VENUE_DELETE_RESET.replace('IF OLD.event_id IS NOT NULL THEN ', '').replace(' END IF;', '')]],
    suites: both },
];
