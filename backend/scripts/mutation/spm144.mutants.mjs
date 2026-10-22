export const SUITES = {
  schemaUnit: {
    args: ['run', 'src/events/dto/event-input.spec.ts'],
  },
  facilitiesE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-facilities.e2e-spec.ts'],
    needsEnv: ['TEST_DATABASE_URL'],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL },
  },
  optionsUnit: {
    args: ['run', 'src/venues/venues.controller.spec.ts'],
  },
};

export const MUTANTS = [
  {
    id: 'SPM144-BE-OPTIONS-LABEL-VALUE',
    name: 'facility option values no longer match the backend schema values',
    file: 'src/venues/venues.controller.ts',
    suites: ['optionsUnit'],
    edits: [[
      'value: name,',
      'value: name.toLowerCase(),',
    ]],
  },
  {
    id: 'SPM144-BE-OPTIONS-ROUTE',
    name: 'the venue options endpoint is mounted at the wrong HTTP path',
    file: 'src/venues/venues.controller.ts',
    suites: ['facilitiesE2E'],
    edits: [["@Get('options')", "@Get('option-list')"]],
  },
  {
    id: 'SPM144-BE-ACCESSIBILITY-OPTION-VALUE',
    name: 'the first accessibility option submits its internal id instead of its label',
    file: 'src/venues/venues.controller.ts',
    suites: ['optionsUnit'],
    edits: [[
      'value: label,',
      'value: accessibilityOptions[0].id,',
    ]],
  },
  {
    id: 'SPM144-BE-FACILITY-SCHEMA',
    name: 'event validation omits current backend venue facilities',
    file: 'src/events/dto/event-input.ts',
    suites: ['schemaUnit', 'facilitiesE2E'],
    edits: [[
      "const facilities = choices('facilities', FACILITIES);",
      "const facilities = choices('facilities', ['Catering']);",
    ]],
  },
  {
    id: 'SPM144-BE-FACILITY-REJECTION',
    name: 'unsupported facility selections bypass validation and are silently discarded',
    file: 'src/events/dto/event-input.ts',
    suites: ['facilitiesE2E'],
    edits: [[
      "const facilities = choices('facilities', FACILITIES);",
      'const facilities = [];',
    ]],
  },
  {
    id: 'SPM144-BE-ACCESSIBILITY-SCHEMA',
    name: 'event validation keeps a local accessibility list instead of venue schema',
    file: 'src/events/dto/event-input.ts',
    suites: ['schemaUnit', 'facilitiesE2E'],
    edits: [[
      'export const ACCESSIBILITY = [...accessibilityLabels];',
      "export const ACCESSIBILITY = ['Wheelchair ramps'];",
    ]],
  },
  {
    id: 'SPM144-BE-ACCESSIBILITY-REJECTION',
    name: 'accessibility validation rejects every submitted choice by using an empty allow-list',
    file: 'src/events/dto/event-input.ts',
    suites: ['facilitiesE2E'],
    edits: [[
      "const accessibility = choices('accessibility', ACCESSIBILITY);",
      "const accessibility = choices('accessibility', []);",
    ]],
  },
  {
    id: 'SPM144-BE-FACILITY-PERSISTENCE',
    name: 'submitted facility values are omitted from the persisted event row',
    file: 'src/events/events.service.ts',
    suites: ['facilitiesE2E'],
    edits: [['        data.facilities,', '        [],']],
  },
  {
    id: 'SPM144-BE-ACCESSIBILITY-PERSISTENCE',
    name: 'submitted accessibility values are omitted from the persisted event row',
    file: 'src/events/events.service.ts',
    suites: ['facilitiesE2E'],
    edits: [['        data.accessibility,', '        [],']],
  },
];
