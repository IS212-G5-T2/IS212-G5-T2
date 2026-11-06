export const SUITES = {
  availability: { args: ['run', 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx'] },
  api: { args: ['run', 'src/features/equipment/api/equipment-api.test.ts'] },
};

// SPM-117 (View and Search Equipment Records). The EQUIP-VIEW-03 component tests
// assert the inventory search rules; these mutants target the actual search
// predicate in EquipmentAvailabilityPage so the harness exercises SPM-117's own
// behaviour. Jira assigns the locations endpoint contract to SPM-117; its API
// mutant is traced to EQUIP-VIEW-02-C.
export const MUTANTS = [
  {
    id: 'FE-117-09',
    name: 'locations lookup requests the general inventory endpoint (EQUIP-VIEW-02-C)',
    file: 'src/features/equipment/api/equipment-api.ts',
    suites: ['api'],
    testMappings: [{ suite: 'api', file: 'src/features/equipment/api/equipment-api.test.ts', title: 'SPM-117 gets equipment locations from the dedicated endpoint' }],
    edits: [["return api<string[]>('/equipment/locations');", "return api<string[]>('/equipment');"]],
  },
  {
    id: 'FE-117-02',
    name: 'type search drops whitespace trimming (EQUIP-VIEW-03-E)',
    file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.tsx',
    suites: ['availability'],
    testMappings: [{ suite: 'availability', file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx', title: 'EQUIP-VIEW-03-E' }],
    edits: [['const typeQuery = typeSearch.trim().toLowerCase();', 'const typeQuery = typeSearch.toLowerCase();']],
  },
  {
    id: 'FE-117-03',
    name: 'type search becomes case-sensitive (EQUIP-VIEW-03-A)',
    file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.tsx',
    suites: ['availability'],
    testMappings: [{ suite: 'availability', file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx', title: 'EQUIP-VIEW-03-A' }],
    edits: [['record.type.toLowerCase().includes(typeQuery)', 'record.type.includes(typeQuery)']],
  },
  {
    id: 'FE-117-04',
    name: 'type and location boxes combine with OR instead of AND (EQUIP-VIEW-03-D)',
    file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.tsx',
    suites: ['availability'],
    testMappings: [{ suite: 'availability', file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx', title: 'EQUIP-VIEW-03-D' }],
    edits: [['includes(typeQuery) &&', 'includes(typeQuery) ||']],
  },
  {
    id: 'FE-117-05',
    name: 'type box reads the location field instead of type (EQUIP-VIEW-03-G)',
    file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.tsx',
    suites: ['availability'],
    testMappings: [{ suite: 'availability', file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx', title: 'EQUIP-VIEW-03-G' }],
    edits: [['record.type.toLowerCase().includes(typeQuery)', 'record.location.toLowerCase().includes(typeQuery)']],
  },
  {
    id: 'FE-117-06',
    name: 'location box reads the type field instead of location (EQUIP-VIEW-03-H)',
    file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.tsx',
    suites: ['availability'],
    testMappings: [{ suite: 'availability', file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx', title: 'EQUIP-VIEW-03-H' }],
    edits: [['record.location.toLowerCase().includes(locationQuery)', 'record.type.toLowerCase().includes(locationQuery)']],
  },
  {
    id: 'FE-117-07',
    name: 'location search drops whitespace trimming (EQUIP-VIEW-03-E, location box)',
    file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.tsx',
    suites: ['availability'],
    testMappings: [{ suite: 'availability', file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx', title: 'EQUIP-VIEW-03-E' }],
    edits: [['const locationQuery = locationSearch.trim().toLowerCase();', 'const locationQuery = locationSearch.toLowerCase();']],
  },
  {
    id: 'FE-117-08',
    name: 'location search becomes case-sensitive (EQUIP-VIEW-03-B)',
    file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.tsx',
    suites: ['availability'],
    testMappings: [{ suite: 'availability', file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx', title: 'EQUIP-VIEW-03-B' }],
    edits: [['record.location.toLowerCase().includes(locationQuery)', 'record.location.includes(locationQuery)']],
  },
];
