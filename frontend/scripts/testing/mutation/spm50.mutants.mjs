// SPM-50 reopened correction mutants, run by run.mjs with --mutants spm50.mutants.mjs.
// Each mutant maps to its exact page test title; the runner validates mappings and runs that test alone.
export const SUITES = {
  unit: {
    args: ['run', 'src/features/venues/pages/create/VenueCreatePage.test.tsx'],
  },
};

const PAGE = 'src/features/venues/pages/create/VenueCreatePage.tsx';
const TEST = 'src/features/venues/pages/create/VenueCreatePage.test.tsx';

export const MUTANTS = [
  {
    id: 'FE-50-01',
    name: 'operating start time is reintroduced as a create field',
    file: PAGE,
    suites: ['unit'],
    testMappings: [{
      suite: 'unit',
      file: TEST,
      title: 'opens location details without an identifier field',
    }],
    edits: [[
      '                <CheckboxGroup\n                  label="Accessibility (optional)"',
      '                <TextInput label="Operating start time" type="time" value="" onChange={() => undefined} />\n                <CheckboxGroup\n                  label="Accessibility (optional)"',
    ]],
  },
  {
    id: 'FE-50-02',
    name: 'operating days become required again',
    file: PAGE,
    suites: ['unit'],
    testMappings: [{
      suite: 'unit',
      file: TEST,
      title: 'allows creation details without operating-day or opening-hour input',
    }],
    edits: [[
      '  function validateVenueDetails(): boolean {\n    const next: Record<string, string> = {};',
      '  function validateVenueDetails(): boolean {\n    const next: Record<string, string> = { operatingDays: "Choose at least one operating day." };',
    ]],
  },
  {
    id: 'FE-50-03',
    name: 'operating hours are sent as creation API fields again',
    file: PAGE,
    suites: ['unit'],
    testMappings: [{
      suite: 'unit',
      file: TEST,
      title: 'creates a venue then redirects to the catalogue',
    }],
    edits: [[
      '      setupTimeMinutes: Number(values.setupTimeMinutes),',
      '      operatingDays: ["Monday"],\n      operatingStartTime: "08:00",\n      operatingEndTime: "22:00",\n      setupTimeMinutes: Number(values.setupTimeMinutes),',
    ]],
  },
];
