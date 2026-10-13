// SPM-50 reopened correction mutants, run by run.mjs with --mutants spm50.mutants.mjs.
// Exact test mappings are checked by the runner and are used to run only each mutant's kill test.
export const SUITES = {
  unit: {
    args: ['run', 'src/venues/creation/dto/venue-input.spec.ts'],
  },
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/venues.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const DTO = 'src/venues/creation/dto/venue-input.ts';
const REPOSITORY = 'src/venues/repository/venues.repository.ts';
const UNIT_TEST = 'src/venues/creation/dto/venue-input.spec.ts';
const E2E_TEST = 'test/venues.e2e-spec.ts';

export const MUTANTS = [
  {
    id: 'BE-50-01',
    name: 'operating days and opening times are required again',
    file: DTO,
    suites: ['unit', 'e2e'],
    testMappings: [
      {
        suite: 'unit',
        file: UNIT_TEST,
        title: 'does not require operating days or opening hours',
      },
      {
        suite: 'e2e',
        file: E2E_TEST,
        title: 'creates a venue without operating hours and persists operating information with a full-week compatibility schedule',
      },
    ],
    edits: [[
      '    body.operatingDays === undefined\n      ? [...operatingDayNames]\n      : array(\'operatingDays\');',
      '    array(\'operatingDays\');',
    ]],
  },
  {
    id: 'BE-50-02',
    name: 'omitted opening hours get a restricted or incorrect compatibility schedule',
    file: DTO,
    suites: ['unit', 'e2e'],
    testMappings: [
      {
        suite: 'unit',
        file: UNIT_TEST,
        title: 'does not require operating days or opening hours',
      },
      {
        suite: 'e2e',
        file: E2E_TEST,
        title: 'creates a venue without operating hours and persists operating information with a full-week compatibility schedule',
      },
    ],
    edits: [
      [
        'body.operatingDays === undefined\n      ? [...operatingDayNames]',
        'body.operatingDays === undefined\n      ? operatingDayNames.slice(0, 5)',
      ],
      ["time('operatingStartTime', '00:00')", "time('operatingStartTime', '08:00')"],
      ["time('operatingEndTime', '23:59')", "time('operatingEndTime', '18:00')"],
    ],
  },
  {
    id: 'BE-50-05',
    name: 'opening times become required again',
    file: DTO,
    suites: ['unit', 'e2e'],
    testMappings: [
      {
        suite: 'unit',
        file: UNIT_TEST,
        title: 'does not require operating days or opening hours',
      },
      {
        suite: 'e2e',
        file: E2E_TEST,
        title: 'creates a venue without operating hours and persists operating information with a full-week compatibility schedule',
      },
    ],
    edits: [[
      '    if (body[key] === undefined) return fallback;',
      "    if (body[key] === undefined) return '';",
    ]],
  },
  {
    id: 'BE-50-03',
    name: 'operating information is optional instead of required',
    file: DTO,
    suites: ['unit'],
    testMappings: [{
      suite: 'unit',
      file: UNIT_TEST,
      title: 'rejects missing operating information independently of venueFields',
    }],
    edits: [[
      "  const operatingInformation = text('operatingInformation', 200);",
      "  const operatingInformation = typeof body.operatingInformation === 'string' ? body.operatingInformation.trim() : '';",
    ]],
  },
  {
    id: 'BE-50-04',
    name: 'persisted operating information is replaced with an empty value',
    file: REPOSITORY,
    suites: ['e2e'],
    testMappings: [{
      suite: 'e2e',
      file: E2E_TEST,
      title: 'creates a venue without operating hours and persists operating information with a full-week compatibility schedule',
    }],
    edits: [['        venue.operatingInformation,', "        '',"]],
  },
];
