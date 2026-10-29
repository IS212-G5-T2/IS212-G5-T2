// SPM-156 backend mutants: change history for changes applied without review (direct updates and approved
// change requests), the history read, the event layout list and migration 027 (retired option values).
// Run: node scripts/mutation/run.mjs --mutants spm156.mutants.mjs   (E2E suites need DATABASE_URL / TEST_DATABASE_URL)
// Each edit is [from, to]; `from` must occur exactly once in the file. The runner edits a scratch copy only.
// Migration 026 constraints are not mutated here: the E2E database is built once from database/postgresql/init,
// so a mutated migration file would not reach the constraints EVENT-UPDATE-07-SEC-1 checks (and re-applying a
// weakened constraint would leave the shared database weakened). 07-SEC-1 pins those constraints directly.
export const SUITES = {
  backendUnit: {
    args: [
      'run',
      'src/events/planning/event-planning.service.spec.ts',
      'src/events/planning/event-planning.repository.spec.ts',
      'src/events/planning/dto/event-update-input.spec.ts',
      'src/events/change-requests/review/change-request-review.service.spec.ts',
    ],
  },
  planningE2E: {
    args: [
      'run',
      '--config',
      './vitest.config.e2e.ts',
      'test/events-planning.e2e-spec.ts',
      'test/events-planning.http.e2e-spec.ts',
    ],
    needsEnv: ['DATABASE_URL'],
  },
  reviewE2E: {
    args: [
      'run',
      '--config',
      './vitest.config.e2e.ts',
      'test/change-request-review.e2e-spec.ts',
    ],
    needsEnv: ['DATABASE_URL'],
  },
  migrationE2E: {
    args: [
      'run',
      '--config',
      './vitest.config.e2e.ts',
      'test/event-options-migration.e2e-spec.ts',
    ],
    needsEnv: ['DATABASE_URL'],
  },
};

const SERVICE = 'src/events/planning/event-planning.service.ts';
const REPOSITORY = 'src/events/planning/event-planning.repository.ts';
const REVIEW =
  'src/events/change-requests/review/change-request-review.service.ts';
const INPUT = 'src/events/dto/event-input.ts';
const M027 = 'migrations/027_spm156_retire_legacy_event_options.sql';

const svc = (title) =>
  `backend/src/events/planning/event-planning.service.spec.ts :: ${title}`;
const repo = (title) =>
  `backend/src/events/planning/event-planning.repository.spec.ts :: ${title}`;
const review = (title) =>
  `backend/src/events/change-requests/review/change-request-review.service.spec.ts :: ${title}`;
const planE2E = (title) =>
  `backend/test/events-planning.e2e-spec.ts :: ${title}`;
const migE2E = (title) =>
  `backend/test/event-options-migration.e2e-spec.ts :: ${title}`;

export const MUTANTS = [
  // ---- direct updates (DoD 2, 6, 8) ----
  {
    id: 'SPM156-DIRECT-NO-HISTORY',
    name: 'an update applied immediately writes no history entry',
    file: SERVICE,
    suites: ['backendUnit', 'planningE2E'],
    kills: [
      svc(
        'EVENT-UPDATE-07-A records every field applied on an Approved event, by the coordinator, at the update time',
      ),
    ],
    edits: [
      [
        '          immediate.map((field) => ({\n            field,\n            originalValue: event[field],',
        '          [].map((field) => ({\n            field,\n            originalValue: event[field],',
      ],
    ],
  },
  {
    id: 'SPM156-DIRECT-WRONG-KIND',
    name: 'a direct update is recorded as a reviewed booking change',
    file: SERVICE,
    suites: ['backendUnit', 'planningE2E'],
    kills: [
      svc(
        'EVENT-UPDATE-07-A records every field applied on an Approved event, by the coordinator, at the update time',
      ),
    ],
    edits: [
      [
        "            kind: 'direct_update',",
        "            kind: 'booking_conflict',",
      ],
    ],
  },
  {
    id: 'SPM156-DIRECT-WRONG-APPLIER',
    name: 'a direct update names someone other than the coordinator',
    file: SERVICE,
    suites: ['backendUnit', 'planningE2E'],
    kills: [
      svc(
        'EVENT-UPDATE-07-A records every field applied on an Approved event, by the coordinator, at the update time',
      ),
    ],
    edits: [
      [
        "            kind: 'direct_update',\n            appliedBy: { name: displayName(user), id: user.uid },",
        "            kind: 'direct_update',\n            appliedBy: { name: displayName(user), id: 'someone-else' },",
      ],
    ],
  },
  {
    id: 'SPM156-DIRECT-OTHER-TIME',
    name: 'the history entry time differs from the event update time',
    file: SERVICE,
    suites: ['backendUnit', 'planningE2E'],
    kills: [
      svc(
        'EVENT-UPDATE-07-A records every field applied on an Approved event, by the coordinator, at the update time',
      ),
    ],
    edits: [
      [
        '          },\n          appliedAt,\n        );',
        '          },\n          new Date(appliedAt.getTime() + 1000),\n        );',
      ],
    ],
  },
  {
    id: 'SPM156-NO-TRANSACTION',
    name: 'the update and its history entry do not share a transaction',
    file: SERVICE,
    suites: ['backendUnit', 'planningE2E'],
    kills: [
      svc(
        'EVENT-UPDATE-07-A fails the whole update when the history write fails',
      ),
      planE2E(
        'EVENT-UPDATE-07-A rolls the event update back when the history insert fails',
      ),
    ],
    edits: [
      [
        "    return typeof repository.runInTransaction === 'function'\n      ? repository.runInTransaction(work)\n      : work();",
        '    return work();',
      ],
    ],
  },
  // ---- history storage and read (DoD 2, 5) ----
  {
    id: 'SPM156-RECORD-EMPTY-INSERT',
    name: 'an update with nothing applied still sends an insert',
    file: REPOSITORY,
    suites: ['backendUnit'],
    kills: [
      repo(
        'EVENT-UPDATE-07-A records direct updates as Applied history rows with bound values',
      ),
    ],
    edits: [
      [
        '    if (!changes.length) return;\n    const proposedBy',
        '    const proposedBy',
      ],
    ],
  },
  {
    id: 'SPM156-RECORD-PROPOSER-IS-APPLIER',
    name: 'an approved change request names the coordinator as its proposer',
    file: REPOSITORY,
    suites: ['backendUnit', 'reviewE2E'],
    kills: [
      repo(
        'EVENT-UPDATE-07-E records an approved change request with the organiser as proposer',
      ),
    ],
    edits: [
      [
        '    const proposedBy = source.proposedBy ?? source.appliedBy;',
        '    const proposedBy = source.appliedBy;',
      ],
    ],
  },
  {
    id: 'SPM156-HISTORY-NO-TIE-BREAK',
    name: 'entries saved by one update lose their stable field order',
    file: REPOSITORY,
    suites: ['planningE2E'],
    kills: [
      planE2E(
        'EVENT-UPDATE-07-A lists entries saved by one update in a stable field order',
      ),
    ],
    edits: [
      ["ORDER BY created_at DESC, field',", "ORDER BY created_at DESC',"],
    ],
  },
  {
    id: 'SPM156-HISTORY-KIND-DROPPED',
    name: 'the history response reports every entry as a reviewed change',
    file: SERVICE,
    suites: ['backendUnit'],
    kills: [
      svc(
        'EVENT-UPDATE-07-C lists direct updates with their kind, newest first, beside reviewed changes',
      ),
    ],
    edits: [
      [
        '        kind: row.kind,\n        field: row.field,',
        "        kind: 'booking_conflict',\n        field: row.field,",
      ],
    ],
  },
  {
    id: 'SPM156-HISTORY-PROPOSER-DROPPED',
    name: 'the history response reports the approver as the proposer',
    file: SERVICE,
    suites: ['backendUnit'],
    kills: [
      svc(
        'EVENT-UPDATE-07-E lists an approved change request with the organiser who proposed it',
      ),
    ],
    edits: [
      [
        '        proposedBy: row.proposedBy,\n        resolvedBy:',
        '        proposedBy: row.resolvedBy,\n        resolvedBy:',
      ],
    ],
  },
  // ---- approved change requests (DoD 3) ----
  {
    id: 'SPM156-APPROVE-NO-HISTORY',
    name: 'approving a change request writes no history entry',
    file: REVIEW,
    suites: ['backendUnit', 'reviewE2E'],
    kills: [
      review(
        'EVENT-UPDATE-07-E records each changed field in the event change history',
      ),
    ],
    edits: [
      [
        '          .filter((field) => !sameValue(field, event[field], valid[field]))',
        '          .filter(() => false)',
      ],
    ],
  },
  {
    id: 'SPM156-APPROVE-UNCHANGED-RECORDED',
    name: 'requested values the event already has are recorded as changes',
    file: REVIEW,
    suites: ['backendUnit', 'reviewE2E'],
    kills: [
      review(
        'EVENT-UPDATE-07-E leaves out requested values the event already has',
      ),
    ],
    edits: [
      [
        '          .filter((field) => !sameValue(field, event[field], valid[field]))',
        '          .filter(() => true)',
      ],
    ],
  },
  {
    id: 'SPM156-APPROVE-WRONG-KIND',
    name: 'an approved change request is recorded as a direct update',
    file: REVIEW,
    suites: ['backendUnit', 'reviewE2E'],
    kills: [
      review(
        'EVENT-UPDATE-07-E records each changed field in the event change history',
      ),
    ],
    edits: [
      ["          kind: 'change_request',", "          kind: 'direct_update',"],
    ],
  },
  {
    id: 'SPM156-APPROVE-WRONG-PROPOSER',
    name: 'an approved change request names the coordinator instead of the organiser who asked',
    file: REVIEW,
    suites: ['backendUnit', 'reviewE2E'],
    kills: [
      review(
        'EVENT-UPDATE-07-E records each changed field in the event change history',
      ),
    ],
    edits: [
      [
        '            id: String(request.requested_by_id),',
        '            id: user.uid,',
      ],
    ],
  },
  {
    id: 'SPM156-APPROVE-HISTORY-ERROR-SWALLOWED',
    name: 'a failed history write no longer fails the approval',
    file: REVIEW,
    suites: ['backendUnit', 'reviewE2E'],
    kills: [
      review(
        'EVENT-UPDATE-07-E fails the approval and commits nothing when the history write fails',
      ),
    ],
    edits: [
      [
        '        now,\n      );\n      const safetyCheckReset =',
        '        now,\n      ).catch(() => undefined);\n      const safetyCheckReset =',
      ],
    ],
  },
  // ---- layouts follow the venue schema (FU 1) ----
  {
    id: 'SPM156-LAYOUTS-OLD-SIX',
    name: 'event updates accept only the six old layouts',
    file: INPUT,
    suites: ['backendUnit'],
    kills: [
      'backend/src/events/planning/dto/event-update-input.spec.ts :: EVENT-UPDATE-08-B accepts every venue-schema option and refuses retired ones',
    ],
    edits: [
      [
        'export const LAYOUTS = [...roomLayoutNames];',
        'export const LAYOUTS = [...roomLayoutNames].slice(0, 6);',
      ],
    ],
  },
  // ---- migration 027 (FU 3) ----
  {
    id: 'SPM156-M027-NO-RAMPS-RENAME',
    name: 'migration 027 drops "Wheelchair ramps" instead of renaming it',
    file: M027,
    suites: ['migrationE2E'],
    kills: [
      migE2E(
        'EVENT-UPDATE-08-A rewrites retired values in events, change requests and drafts, keeping order',
      ),
    ],
    edits: [
      [
        "item IN ('Wheelchair ramps', 'Step-free access')",
        "item IN ('Step-free access')",
      ],
    ],
  },
  {
    id: 'SPM156-M027-NO-PA-RENAME',
    name: 'migration 027 drops "PA System" instead of renaming it',
    file: M027,
    suites: ['migrationE2E'],
    kills: [
      migE2E(
        'EVENT-UPDATE-08-A rewrites retired values in events, change requests and drafts, keeping order',
      ),
    ],
    edits: [
      [
        "WHEN kind = 'facilities' AND item = 'PA System' THEN 'AV System'",
        "WHEN kind = 'facilities' AND item = 'PA System ' THEN 'AV System'",
      ],
    ],
  },
  {
    id: 'SPM156-M027-KEEPS-INACTIVE-FEATURE',
    name: 'migration 027 keeps accessibility features that are no longer active',
    file: M027,
    suites: ['migrationE2E'],
    kills: [
      migE2E(
        'EVENT-UPDATE-08-A keeps only active options and leaves submitted drafts, audit and history unchanged',
      ),
    ],
    edits: [
      [
        'AND mapped IN (SELECT label FROM accessibility_features WHERE is_active))',
        'AND mapped IN (SELECT label FROM accessibility_features))',
      ],
    ],
  },
  {
    id: 'SPM156-M027-KEEPS-INACTIVE-FACILITY',
    name: 'migration 027 keeps facilities that are no longer active',
    file: M027,
    suites: ['migrationE2E'],
    kills: [
      migE2E(
        'EVENT-UPDATE-08-A keeps only active options and leaves submitted drafts, audit and history unchanged',
      ),
    ],
    edits: [
      [
        'AND mapped IN (SELECT name FROM facilities WHERE is_active))',
        'AND mapped IN (SELECT name FROM facilities))',
      ],
    ],
  },
  {
    id: 'SPM156-M027-REWRITES-SUBMITTED-DRAFTS',
    name: 'migration 027 also rewrites drafts that were already submitted',
    file: M027,
    suites: ['migrationE2E'],
    kills: [
      migE2E(
        'EVENT-UPDATE-08-A keeps only active options and leaves submitted drafts, audit and history unchanged',
      ),
    ],
    edits: [["     WHERE status = 'Draft'", '     WHERE true']],
  },
  {
    id: 'SPM156-M027-NO-DEDUPE',
    name: 'migration 027 keeps duplicate values after renaming',
    file: M027,
    suites: ['migrationE2E'],
    kills: [
      migE2E(
        'EVENT-UPDATE-08-A rewrites retired values in events, change requests and drafts, keeping order',
      ),
    ],
    edits: [
      [
        '       GROUP BY mapped\n    ) kept',
        '       GROUP BY mapped, position\n    ) kept',
      ],
    ],
  },
];
