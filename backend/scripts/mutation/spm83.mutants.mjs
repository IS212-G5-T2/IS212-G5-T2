export const SUITES = {
  rejection: { args: ['run', 'src/events/review/events.reject.spec.ts'] },
};

export const MUTANTS = [{
  id: 'BE-83-01',
  name: 'non-string rejection reasons receive a fabricated valid reason',
  file: 'src/events/events.service.ts',
  suites: ['rejection'],
  testMappings: [{
    suite: 'rejection', file: 'src/events/review/events.reject.spec.ts',
    title: 'SPM-83 rejects non-string rejection reason',
  }],
  edits: [[
    "const raw = typeof reason === 'string' ? reason : '';",
    "const raw = typeof reason === 'string' ? reason : 'fabricated valid rejection reason';",
  ]],
}];
