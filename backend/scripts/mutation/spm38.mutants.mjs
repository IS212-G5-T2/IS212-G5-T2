// SPM-38 backend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  events: { args: ['run', 'src/events/events.service.spec.ts'] },
};

export const MUTANTS = [
  { id: 'BE-38-01', name: 'a coordinator who is not assigned can read the request details (EVE-REV-04-B)',
    file: 'src/events/events.service.ts', suites: ['events'],
    edits: [["user.roles.includes('COORDINATOR') && row.coordinator_id === user.uid;", "user.roles.includes('COORDINATOR') && true;"]] },
];
