const SERVICE = 'src/events/safety-officer/safety-officer.service.ts';
const UNIT = 'src/events/safety-officer/safety-officer.service.spec.ts';
const E2E = 'test/safety-officer.e2e-spec.ts';
const unit = (title) => ({ suite: 'unit', file: UNIT, title });
const e2e = (title) => ({ suite: 'backend-e2e', file: E2E, title });

export const SUITES = {
  unit: { args: ['run', 'src/events/safety-officer/safety-officer.service.spec.ts'] },
  'backend-e2e': {
    args: ['run', '--config', 'vitest.config.e2e.ts', E2E],
    env: {},
    needsEnv: ['TEST_DATABASE_URL'],
  },
};

export const MUTANTS = [
  {
    id: 'S130-BE-04',
    name: 'approval is stored with a non-approved state or stale feedback (SAFETY-DECISION-01)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [["[eventId, decision, name, feedback]", "[eventId, 'rejected', name, feedback]"]],
    testMappings: [
      unit('SAFETY-DECISION-01 records an approval against the still-pending event'),
      e2e('SAFETY-DECISION-01 persists approval and removes the event from the decision queue'),
    ],
  },
  {
    id: 'S130-BE-01',
    name: 'a change request with neither a reason nor change rows is accepted (SAFETY-DECISION-04)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [["throw new BadRequestException('Add at least one change and select arrangements for review.');", "feedbackItems = [];"]],
    testMappings: [
      unit('refuses %s without a nonblank reason before starting a response transaction'),
      e2e('SAFETY-DECISION-04 refuses %s with missing or blank feedback'),
    ],
  },
  {
    id: 'S130-BE-02',
    name: 'a rejection or change request is persisted as approval (SAFETY-DECISION-02/03)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [["[eventId, decision, name, feedback]", "[eventId, 'approved', name, feedback]"]],
    testMappings: [
      unit('SAFETY-DECISION-02 records rejection and its feedback reason'),
      unit('SAFETY-DECISION-03 persists each selected change row independently'),
      e2e('SAFETY-DECISION-02 persists rejection with its required reason'),
      e2e('SAFETY-DECISION-03 persists requested changes with their description'),
    ],
  },
  {
    id: 'S130-BE-03',
    name: 'rejection and change-request feedback is not retained for coordinators (SAFETY-DECISION-02/03)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [["for (const feedbackItem of feedbackItems) {", 'if (false) {']],
    testMappings: [
      unit('SAFETY-DECISION-02 records rejection and its feedback reason'),
      unit('SAFETY-DECISION-03 persists each selected change row independently'),
      e2e('SAFETY-DECISION-02 persists rejection with its required reason'),
      e2e('SAFETY-DECISION-03 persists requested changes with their description'),
      e2e('SAFETY-DECISION-03 persists and independently resolves multiple requested changes'),
    ],
  },
  {
    id: 'S130-BE-05',
    name: 'the API accepts a blank or malformed change-array row (SAFETY-DECISION-04)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [["if (typeof row.text !== 'string' || !row.text.trim())", 'if (false)']],
    testMappings: [
      unit('SAFETY-DECISION-04 refuses %s without writing a decision'),
      e2e('SAFETY-DECISION-04 refuses a changes array containing a blank row atomically'),
    ],
  },
  {
    id: 'S130-BE-06',
    name: 'the API persists only one of the explicit change rows (SAFETY-DECISION-03)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [["for (const feedbackItem of feedbackItems) {", "for (const feedbackItem of feedbackItems.slice(0, 1)) {"]],
    testMappings: [
      unit('SAFETY-DECISION-03 persists each selected change row independently'),
      e2e('SAFETY-DECISION-03 persists and independently resolves multiple requested changes'),
    ],
  },
  {
    id: 'S130-BE-07',
    name: 'an unauthorised coordinator can approve a safety decision (SAFETY-DECISION-01)',
    file: SERVICE,
    suites: ['backend-e2e'],
    edits: [[
      'const user = this.requireSafetyOfficer(identity);',
      "const user = identity && !identity.roles.includes('SAFETY_OFFICER') && body && typeof body === 'object' && (body as { decision?: unknown }).decision === 'approved' ? identity : this.requireSafetyOfficer(identity);",
    ]],
    testMappings: [e2e('SAFETY-DECISION-01 refuses unauthorized approval attempts and preserves the pending decision')],
  },
  {
    id: 'S130-BE-08',
    name: 'an unauthorised coordinator can reject a safety decision (SAFETY-DECISION-02)',
    file: SERVICE,
    suites: ['backend-e2e'],
    edits: [[
      'const user = this.requireSafetyOfficer(identity);',
      "const user = identity && !identity.roles.includes('SAFETY_OFFICER') && body && typeof body === 'object' && (body as { decision?: unknown }).decision === 'rejected' ? identity : this.requireSafetyOfficer(identity);",
    ]],
    testMappings: [e2e('SAFETY-DECISION-02 refuses unauthorized rejection attempts and preserves the pending decision')],
  },
  {
    id: 'S130-BE-09',
    name: 'an unauthorised coordinator can request changes (SAFETY-DECISION-03)',
    file: SERVICE,
    suites: ['backend-e2e'],
    edits: [[
      'const user = this.requireSafetyOfficer(identity);',
      "const user = identity && !identity.roles.includes('SAFETY_OFFICER') && body && typeof body === 'object' && (body as { decision?: unknown }).decision === 'changes_needed' ? identity : this.requireSafetyOfficer(identity);",
    ]],
    testMappings: [e2e('SAFETY-DECISION-03 refuses unauthorized change-request attempts and preserves the pending decision')],
  },
  {
    id: 'S130-BE-10',
    name: 'feedback text is bound as a UUID instead of the event id in PostgreSQL (SAFETY-DECISION-03)',
    file: SERVICE,
    suites: ['backend-e2e'],
    edits: [[
      '[eventId, feedbackItem.text, JSON.stringify(reviewArrangements)],',
      '[feedbackItem.text, eventId, JSON.stringify(reviewArrangements)],',
    ]],
    testMappings: [e2e('SAFETY-DECISION-03 persists and independently resolves multiple requested changes')],
  },
  {
    id: 'S130-BE-11',
    name: 'a rejection can proceed without its mandatory reason (SAFETY-DECISION-02/04)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [[
      "if (!reason) throw new BadRequestException('A reason is required for rejection.');",
      "if (false) throw new BadRequestException('A reason is required for rejection.');",
    ]],
    testMappings: [
      unit('refuses %s without a nonblank reason before starting a response transaction'),
      e2e('SAFETY-DECISION-04 refuses %s with missing or blank feedback'),
    ],
  },
  {
    id: 'S130-BE-12',
    name: 'an empty changes array is accepted (SAFETY-DECISION-04)',
    file: SERVICE,
    suites: ['unit'],
    edits: [['if (input.changes.length === 0)', 'if (false)']],
    testMappings: [unit('SAFETY-DECISION-04 refuses %s without writing a decision')],
  },
];
