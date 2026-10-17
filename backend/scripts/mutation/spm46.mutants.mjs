// SPM-46 backend mutants (View a Reassigned Event), run by run.mjs:
//   node scripts/mutation/run.mjs --mutants spm46.mutants.mjs
// Each edit is [from, to]; `from` must occur exactly once in the file. IDs match the Confluence
// REASN-VIEW pages ("Mutation-checked") and the frontend spm46.mutants.mjs (F*).
export const SUITES = {
  // Unit specs for the reassign write and the event reads.
  unit: { args: ['run', 'src/lead/lead-assignment.service.spec.ts', 'src/events/events.service.spec.ts'] },
  // PostgreSQL integration suite; needs DATABASE_URL with database/postgresql/init 001 to 010 applied.
  e2e: { args: ['run', '--config', './vitest.config.e2e.ts', 'test/lead-assignment.e2e-spec.ts'], needsEnv: ['DATABASE_URL'] },
};

const LEAD = 'src/lead/lead-assignment.service.ts';
const EVENTS = 'src/events/events.service.ts';

export const MUTANTS = [
  { id: 'B1', name: 'reassign no longer records the history row (kills REASN-VIEW-02-A, 02-E)', file: LEAD,
    edits: [['      await client.query(\n        `INSERT INTO event_reassignments', '      if (false) await client.query(\n        `INSERT INTO event_reassignments']], suites: ['unit', 'e2e'] },
  { id: 'B2', name: 'reassignedFrom shown even when the latest reassignment went elsewhere (kills 02-D)', file: EVENTS,
    edits: [['if (!latest || latest.toCoordinatorId !== row.coordinator_id) return undefined;', 'if (!latest) return undefined;']], suites: ['unit'] },
  { id: 'B3', name: 'oldest reassignment chosen instead of the latest (kills 02-D, 02-E)', file: EVENTS,
    edits: [['ORDER BY r.reassigned_at DESC, r.id DESC', 'ORDER BY r.reassigned_at ASC, r.id DESC']], suites: ['unit', 'e2e'] },
  { id: 'B4', name: 'reassignment time returned unconverted (kills 02-C)', file: EVENTS,
    edits: [['reassignedAt: new Date(latest.reassignedAt).toISOString() };', 'reassignedAt: latest.reassignedAt };']], suites: ['unit'] },
  { id: 'B5', name: 'previous coordinator gets "not found" instead of the reassigned message (kills 04-A, 04-B)', file: EVENTS,
    edits: [['        if (held.rows.length)\n', '        if (false)\n']], suites: ['unit', 'e2e'] },
  { id: 'B6', name: 'reassigned message names the new coordinator (kills 04-A, 04-B)', file: EVENTS,
    edits: [["throw new ForbiddenException('This event has been reassigned to another Coordinator.');", 'throw new ForbiddenException(`This event has been reassigned to ${row.coordinator_name}.`);']], suites: ['unit', 'e2e'] },
  { id: 'B7', name: "any history row counts, not just the caller's (kills 04-B)", file: EVENTS,
    edits: [["WHERE event_id = $1 AND from_coordinator_id = $2 LIMIT 1',\n          [id, user.uid],", "WHERE event_id = $1 LIMIT 1',\n          [id],"]], suites: ['e2e'] },
  { id: 'B8', name: 'reassignment notice not linked to the event (kills 01-A)', file: LEAD,
    edits: [['[randomUUID(), coordinator.id, `Event "${event.event_name}" has been reassigned to you.`, eventId],', '[randomUUID(), coordinator.id, `Event "${event.event_name}" has been reassigned to you.`, null],']], suites: ['e2e'] },
  { id: 'B9', name: 'reassignment details sent to every viewer, not only the current coordinator (kills 02-I)', file: EVENTS,
    edits: [['  if (!viewerUid || viewerUid !== row.coordinator_id) return undefined;\n', '']], suites: ['unit'] },
  { id: 'B10', name: 'no id tie-break when reassignment times are equal (kills 02-D)', file: EVENTS,
    edits: [['ORDER BY r.reassigned_at DESC, r.id DESC', 'ORDER BY r.reassigned_at DESC']], suites: ['unit'] },
  { id: 'B11', name: 'history written outside the reassignment transaction (kills 02-A, 02-J)', file: LEAD,
    edits: [['      await client.query(\n        `INSERT INTO event_reassignments', '      void this.database.query(\n        `INSERT INTO event_reassignments']], suites: ['unit', 'e2e'] },
];
