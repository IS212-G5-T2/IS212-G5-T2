// SPM-36 backend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  create: { args: ['run', 'src/events/dto/event-input.spec.ts', 'src/events/events.service.spec.ts'] },
};

export const MUTANTS = [
  { id: 'BE-36-01', name: 'a blank required field (name) is accepted: the required check is dropped (EVE-CRE-04-A)',
    file: 'src/events/dto/event-input.ts', suites: ['create'],
    edits: [["if (required && !result) errors[key] = 'This field is required.';", "if (false) errors[key] = 'This field is required.';"]] },
  { id: 'BE-36-02', name: 'a name longer than its limit is accepted: the length check is dropped (EVE-CRE-05-C)',
    file: 'src/events/dto/event-input.ts', suites: ['create'],
    edits: [['if (result.length > max) errors[key] = `Use ${max} characters or fewer.`;', 'if (false) errors[key] = `Use ${max} characters or fewer.`;']] },
];
