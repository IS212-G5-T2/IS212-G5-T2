// SPM-50 reopened correction mutants, run by run.mjs with --mutants spm50.mutants.mjs.
// Each mutant maps to its exact page test title; the runner validates mappings and runs that test alone.
export const SUITES = {
  unit: {
    args: ['run', 'src/features/venues/pages/create/VenueCreatePage.test.tsx'],
  },
  venueCard: {
    args: ['run', 'src/features/venues/pages/catalogue/VenueCard.test.tsx'],
  },
  venueDetail: {
    args: ['run', 'src/features/venues/pages/detail/VenueDetailPage.test.tsx'],
  },
  recordCards: {
    args: ['run', 'src/features/venues/pages/records/catalogue/VenueRecordsPage.test.tsx'],
  },
  recordDetail: {
    args: ['run', 'src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx'],
  },
};

const PAGE = 'src/features/venues/pages/create/VenueCreatePage.tsx';
const TEST = 'src/features/venues/pages/create/VenueCreatePage.test.tsx';
const CARD = 'src/features/venues/pages/catalogue/VenueCard.tsx';
const CARD_TEST = 'src/features/venues/pages/catalogue/VenueCard.test.tsx';
const DETAIL = 'src/features/venues/pages/detail/VenueDetailPage.tsx';
const DETAIL_TEST = 'src/features/venues/pages/detail/VenueDetailPage.test.tsx';
const RECORD_CARD = 'src/features/venues/pages/records/catalogue/VenueRecordCard.tsx';
const RECORD_CARDS_TEST = 'src/features/venues/pages/records/catalogue/VenueRecordsPage.test.tsx';
const RECORD_DETAIL = 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx';
const RECORD_DETAIL_TEST = 'src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx';

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
  {
    id: 'FE-50-04',
    name: 'operating hours are rendered on the public venue card',
    file: CARD,
    suites: ['venueCard'],
    testMappings: [{ suite: 'venueCard', file: CARD_TEST, title: 'renders operating information and durations without an image' }],
    edits: [['        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">\n          Setup:', '        <p>Hours: Monday to Sunday · 00:00–23:59</p>\n        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">\n          Setup:']],
  },
  {
    id: 'FE-50-05',
    name: 'operating hours are rendered on the public venue detail page',
    file: DETAIL,
    suites: ['venueDetail'],
    testMappings: [{ suite: 'venueDetail', file: DETAIL_TEST, title: 'renders venue details and durations when no image is saved' }],
    edits: [['              <div>\n                <dt className="text-gray-400 dark:text-gray-500">Setup time</dt>', '              <div>\n                <dt>Operating hours</dt><dd>24 hours</dd>\n              </div>\n              <div>\n                <dt className="text-gray-400 dark:text-gray-500">Setup time</dt>']],
  },
  {
    id: 'FE-50-06',
    name: 'operating hours are rendered on staff venue catalogue cards',
    file: RECORD_CARD,
    suites: ['recordCards'],
    testMappings: [{ suite: 'recordCards', file: RECORD_CARDS_TEST, title: 'VEN-VIEW-02-A: shows all three venues with correct fields and status' }],
    edits: [['            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">\n              Layout options:', '            <p>Hours: Monday to Sunday · 00:00–23:59</p>\n            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">\n              Layout options:']],
  },
  {
    id: 'FE-50-07',
    name: 'operating hours are rendered on staff venue detail pages',
    file: RECORD_DETAIL,
    suites: ['recordDetail'],
    testMappings: [{ suite: 'recordDetail', file: RECORD_DETAIL_TEST, title: "VEN-VIEW-07-A: shows the selected venue's accessibility, setup and turnaround" }],
    edits: [['              <div>\n                <dt>Setup requirements</dt>', '              <div>\n                <dt>Operating hours</dt><dd>24 hours</dd>\n              </div>\n              <div>\n                <dt>Setup requirements</dt>']],
  },
];
