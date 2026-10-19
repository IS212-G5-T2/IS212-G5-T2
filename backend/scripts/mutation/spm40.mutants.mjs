// SPM-40 backend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  approve: { args: ['run', 'src/events/review/events.approve.spec.ts'] },
};

export const MUTANTS = [
  { id: 'BE-40-01', name: 'an approved (or any non-Submitted) request can be approved again: the Submitted guard is dropped (EVENT-APPROVE-04-A)',
    file: 'src/events/events.service.ts', suites: ['approve'],
    edits: [["      if (event.status !== 'Submitted')\n        throw new ConflictException(\n          'Only Submitted requests can be approved.", "      if (false)\n        throw new ConflictException(\n          'Only Submitted requests can be approved."]] },
];
