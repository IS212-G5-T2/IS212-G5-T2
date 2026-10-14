// SPM-50 operating-data removal mutants, run by run.mjs with --mutants spm50.mutants.mjs.
// Exact test mappings are checked by the runner and run alone for each mutant.
export const SUITES = {
  unit: {
    args: ['run', 'src/venues/creation/dto/venue-input.spec.ts'],
  },
  e2e: {
    args: [
      'run',
      '--config',
      './vitest.config.e2e.ts',
      'test/venues.e2e-spec.ts',
    ],
    needsEnv: ['DATABASE_URL'],
  },
  schema: {
    args: ['run', 'src/venues/creation/dto/venue-input.spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const DTO = 'src/venues/creation/dto/venue-input.ts';
const REPOSITORY = 'src/venues/repository/venues.repository.ts';
const MIGRATION = 'migrations/010_remove_venue_operating_schedule.sql';
const FRESH_SCHEMA = '../database/postgresql/init/001_schema.sql';
const UNIT_TEST = 'src/venues/creation/dto/venue-input.spec.ts';
const E2E_TEST = 'test/venues.e2e-spec.ts';
const REMOVAL_TEST =
  'discards legacy schedule fields and exposes operating information without schedule properties';
const LEGACY_HTTP_TEST =
  'ignores null and incomplete legacy schedules over HTTP';

export const MUTANTS = [
  {
    id: 'BE-50-01',
    name: 'legacy operating schedule properties leak into normalized venue input',
    file: DTO,
    suites: ['unit'],
    testMappings: [
      {
        suite: 'unit',
        file: UNIT_TEST,
        title:
          'silently discards legacy schedule properties from older clients',
      },
    ],
    edits: [
      [
        '    operatingInformation,',
        '    operatingDays: body.operatingDays,\n    operatingStartTime: body.operatingStartTime,\n    operatingEndTime: body.operatingEndTime,\n    operatingInformation,',
      ],
    ],
  },
  {
    id: 'BE-50-02',
    name: 'operating schedule migration leaves the legacy database columns in place',
    file: MIGRATION,
    suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: E2E_TEST, title: REMOVAL_TEST }],
    edits: [
      [
        '    DROP COLUMN IF EXISTS operating_days,',
        '    ADD COLUMN IF NOT EXISTS operating_days text,',
      ],
    ],
  },
  {
    id: 'BE-50-03',
    name: 'operating information becomes optional instead of required',
    file: DTO,
    suites: ['unit'],
    testMappings: [
      {
        suite: 'unit',
        file: UNIT_TEST,
        title:
          'rejects missing operating information independently of venueFields',
      },
    ],
    edits: [
      [
        "  const operatingInformation = text('operatingInformation', 200);",
        "  const operatingInformation = typeof body.operatingInformation === 'string' ? body.operatingInformation.trim() : '';",
      ],
    ],
  },
  {
    id: 'BE-50-04',
    name: 'persisted operating information is replaced with an empty value',
    file: REPOSITORY,
    suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: E2E_TEST, title: REMOVAL_TEST }],
    edits: [['        venue.operatingInformation,', "        '',"]],
  },
  {
    id: 'BE-50-05',
    name: 'fresh local schema recreates a retired venue schedule column',
    file: FRESH_SCHEMA,
    suites: ['schema'],
    testMappings: [
      {
        suite: 'schema',
        file: UNIT_TEST,
        title:
          'keeps retired schedule columns out of the effective fresh venue schema',
      },
    ],
    edits: [
      [
        ');\n\nCREATE UNIQUE INDEX IF NOT EXISTS venues_name_location_unique',
        ');\n\nALTER TABLE venues ADD COLUMN operating_days text[];\n\nCREATE UNIQUE INDEX IF NOT EXISTS venues_name_location_unique',
      ],
    ],
  },
  {
    id: 'BE-50-06',
    name: 'null legacy schedule values are rejected instead of ignored',
    file: DTO,
    suites: ['unit', 'e2e'],
    testMappings: [
      {
        suite: 'unit',
        file: UNIT_TEST,
        title:
          'silently discards legacy schedule properties from older clients',
      },
      { suite: 'e2e', file: E2E_TEST, title: LEGACY_HTTP_TEST },
    ],
    edits: [
      [
        "  const operatingInformation = text('operatingInformation', 200);",
        "  if (body.operatingDays === null || body.operatingStartTime === null || body.operatingEndTime === null) errors.operatingDays = 'Invalid legacy schedule.';\n  const operatingInformation = text('operatingInformation', 200);",
      ],
    ],
  },
  {
    id: 'BE-50-07',
    name: 'partial legacy schedule values are rejected instead of ignored',
    file: DTO,
    suites: ['unit', 'e2e'],
    testMappings: [
      {
        suite: 'unit',
        file: UNIT_TEST,
        title:
          'silently discards legacy schedule properties from older clients',
      },
      { suite: 'e2e', file: E2E_TEST, title: LEGACY_HTTP_TEST },
    ],
    edits: [
      [
        "  const operatingInformation = text('operatingInformation', 200);",
        "  if ([body.operatingDays, body.operatingStartTime, body.operatingEndTime].some((value) => value !== undefined)) errors.operatingDays = 'Invalid legacy schedule.';\n  const operatingInformation = text('operatingInformation', 200);",
      ],
    ],
  },
];
