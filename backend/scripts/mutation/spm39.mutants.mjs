// SPM-39 backend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  clarifications: { args: ['run', 'src/clarifications/clarifications.service.spec.ts', 'src/clarifications/dto/clarification-input.spec.ts'] },
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/clarifications.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  { id: 'BE-39-01', name: 'a whitespace-only clarification message is accepted: the blank check is dropped (REQ-CLAR-01-B)',
    file: 'src/clarifications/dto/clarification-input.ts', suites: ['clarifications', 'e2e'],
    testMappings: [{ suite: 'clarifications', file: 'src/clarifications/dto/clarification-input.spec.ts', title: 'rejects a blank message' }, { suite: 'e2e', file: 'test/clarifications.e2e-spec.ts', title: 'REQ-CLAR-01-B: Event Coordinator cannot submit a blank clarification message' }],
    edits: [['if (!message) {', 'if (false) {']] },
  { id: 'BE-39-02', name: 'a coordinator who is not assigned to the event may request a clarification (REQ-CLAR-03)',
    file: 'src/clarifications/clarifications.service.ts', suites: ['clarifications', 'e2e'],
    testMappings: [{ suite: 'clarifications', file: 'src/clarifications/clarifications.service.spec.ts', title: 'rejects a coordinator not assigned to the event, with no DB mutation' }, { suite: 'e2e', file: 'test/clarifications.e2e-spec.ts', title: 'REQ-CLAR-03: Event Coordinator cannot request clarification on an event assigned to another Coordinator' }],
    edits: [['if (event.coordinator_id !== user.uid) {', 'if (false) {']] },
  { id: 'BE-39-03', name: 'a non-party may read the comment history of an event (REQ-CLAR-SUP-59, REQ-CLAR-SUP-60)',
    file: 'src/clarifications/clarifications.service.ts', suites: ['e2e'],
    testMappings: [{"suite":"e2e","file":"test/clarifications.e2e-spec.ts","title":"REQ-CLAR-SUP-59 refuses the comment history to an unrelated organiser (AC4 Security)"}, {"suite":"e2e","file":"test/clarifications.e2e-spec.ts","title":"REQ-CLAR-SUP-60 does not return the awaiting-reply state to an unrelated user (AC5 Security)"}],
    edits: [['    if (!isOrganiser && !isAssignedCoordinator) {', '    if (false && !isOrganiser && !isAssignedCoordinator) {']] },
  { id: 'BE-39-04', name: 'a reply can target a clarification of another event (REQ-CLAR-SUP-58)',
    file: 'src/clarifications/repository/clarifications.repository.ts', suites: ['e2e'],
    testMappings: [{"suite":"e2e","file":"test/clarifications.e2e-spec.ts","title":"REQ-CLAR-SUP-58 refuses a reply to an event A clarification sent through event B (AC1 Isolation)"}],
    edits: [['WHERE id = $1 AND event_id = $2 AND type = \x27clarification\x27 FOR UPDATE', 'WHERE id = $1 AND ($2::uuid IS NOT NULL) AND type = \x27clarification\x27 FOR UPDATE']] },
  { id: 'BE-39-05', name: 'the comment history lists the comments of every event (REQ-CLAR-SUP-57, REQ-CLAR-SUP-61)',
    file: 'src/clarifications/repository/clarifications.repository.ts', suites: ['e2e'],
    testMappings: [{"suite":"e2e","file":"test/clarifications.e2e-spec.ts","title":"REQ-CLAR-SUP-57 keeps a clarification on one event out of another event thread (AC1, AC3, AC4 Isolation)"}, {"suite":"e2e","file":"test/clarifications.e2e-spec.ts","title":"REQ-CLAR-SUP-61 does not show an awaiting reply on event B for a clarification on event A (AC5 Isolation)"}],
    edits: [['SELECT * FROM event_comments WHERE event_id = $1 ORDER BY created_at ASC', 'SELECT * FROM event_comments WHERE ($1::uuid IS NOT NULL) ORDER BY created_at ASC']] },
  { id: 'BE-39-06', name: 'a coordinator role may reply or resolve on an event with no assigned coordinator (defect D-1; REQ-CLAR-SUP-63, REQ-CLAR-SUP-64)',
    file: 'src/clarifications/clarifications.service.ts', suites: ['clarifications', 'e2e'],
    testMappings: [{ suite: 'clarifications', file: 'src/clarifications/clarifications.service.spec.ts', title: 'REQ-CLAR-SUP-64 refuses a reply by a coordinator role on an event with no assigned coordinator (defect D-1)' }, { suite: 'e2e', file: 'test/clarifications.e2e-spec.ts', title: 'REQ-CLAR-SUP-63 refuses a reply and a resolve by a coordinator role on an event with no assigned coordinator (AC4 Security)' }],
    edits: [["const isCoordinator =\n      user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid;", "const isCoordinator =\n      user.roles.includes('COORDINATOR') && (event.coordinator_id === user.uid || !event.coordinator_id);"]] },  { id: 'BE-39-07', name: 'the clarification message limit is off by one downwards: 2000 characters is rejected (REQ-CLAR-SUP-35)',
    file: 'src/clarifications/dto/clarification-input.ts', suites: ['clarifications'],
    testMappings: [{ suite: 'clarifications', file: 'src/clarifications/dto/clarification-input.spec.ts', title: 'REQ-CLAR-SUP-35 accepts a message of exactly 2000 characters' }],
    edits: [['const MAX_MESSAGE_LENGTH = 2000;', 'const MAX_MESSAGE_LENGTH = 1999;']] },
  { id: 'BE-39-08', name: 'the clarification message limit comparison is inclusive: a message of exactly 2000 characters is rejected (REQ-CLAR-SUP-35)',
    file: 'src/clarifications/dto/clarification-input.ts', suites: ['clarifications'],
    testMappings: [{ suite: 'clarifications', file: 'src/clarifications/dto/clarification-input.spec.ts', title: 'REQ-CLAR-SUP-35 accepts a message of exactly 2000 characters' }],
    edits: [['if (message.length > MAX_MESSAGE_LENGTH) {', 'if (message.length >= MAX_MESSAGE_LENGTH) {']] },
];

