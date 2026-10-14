// SPM-50 operating-data removal mutants, run by run.mjs with --mutants spm50.mutants.mjs.
// Exact test mappings are checked by the runner and run alone for each mutant.
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
const MIGRATION = 'migrations/010_remove_venue_operating_schedule.sql';
const UNIT_TEST = 'src/venues/creation/dto/venue-input.spec.ts';
const E2E_TEST = 'test/venues.e2e-spec.ts';
const REMOVAL_TEST = 'discards legacy schedule fields and exposes operating information without schedule properties';

export const MUTANTS = [
  {
    id: 'BE-50-01',
    name: 'legacy operating schedule properties leak into normalized venue input',
    file: DTO,
    suites: ['unit'],
    testMappings: [{
      suite: 'unit',
      file: UNIT_TEST,
      title: 'silently discards legacy schedule properties from older clients',
    }],
    edits: [[
      '    operatingInformation,',
      '    operatingDays: body.operatingDays,\n    operatingStartTime: body.operatingStartTime,\n    operatingEndTime: body.operatingEndTime,\n    operatingInformation,',
    ]],
  },
  {
    id: 'BE-50-02',
    name: 'operating schedule migration leaves the legacy database columns in place',
    file: MIGRATION,
    suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: E2E_TEST, title: REMOVAL_TEST }],
    edits: [[
      '    DROP COLUMN IF EXISTS operating_days,',
      '    ADD COLUMN IF NOT EXISTS operating_days text,',
    ]],
  },
  {
    id: 'BE-50-03',
    name: 'operating information becomes optional instead of required',
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
    testMappings: [{ suite: 'e2e', file: E2E_TEST, title: REMOVAL_TEST }],
    edits: [['        venue.operatingInformation,', "        '',"]],
  },
];
