export const SUITES = {
  service: { args: ['run', 'src/equipment/equipment.service.spec.ts'] },
  controller: { args: ['run', 'src/equipment/equipment.controller.spec.ts'] },
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/equipment.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

// SPM-117 (View and Search Equipment Records). These mutants target SPM-117's
// own AC4 rule — the inventory must surface every maintenance status — at both
// the service-mapping layer (killed by the mocked-DB unit test EQUIP-VIEW-04-B)
// and the real SQL layer (killed only by the database-backed EQUIP-VIEW-04-C).
// AC3 search is covered by the frontend harness. The locations endpoint
// contract and controller delegation are assigned to SPM-117 by Jira and
// traced to EQUIP-VIEW-02-C. includeUnavailable remains under SPM-119.
export const MUTANTS = [
  {
    id: 'BE-117-05',
    name: 'equipment locations route delegates to inventory listing (EQUIP-VIEW-02-C)',
    file: 'src/equipment/equipment.controller.ts',
    suites: ['controller'],
    testMappings: [{
      suite: 'controller', file: 'src/equipment/equipment.controller.spec.ts',
      title: 'EQUIP-VIEW-02-C delegates the equipment locations lookup',
    }],
    edits: [[
      'return this.equipment.listLocations(request[CURRENT_USER_REQUEST_KEY]);',
      'return this.equipment.list(request[CURRENT_USER_REQUEST_KEY]);',
    ]],
  },
  {
    id: 'BE-117-03',
    name: 'inventory mapping hard-codes maintenance status to Active (EQUIP-VIEW-04-B)',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service'],
    testMappings: [{
      suite: 'service', file: 'src/equipment/equipment.service.spec.ts',
      title: 'EQUIP-VIEW-04-B maps every maintenance status to its equipment record',
    }],
    edits: [['maintenanceStatus: row.maintenance_status,\r\n    location: row.location,', "maintenanceStatus: 'Active',\r\n    location: row.location,"]],
  },
  {
    id: 'BE-117-04',
    name: 'real inventory SQL filters to Active-only maintenance status (EQUIP-VIEW-04-C)',
    file: 'src/equipment/equipment.service.ts',
    suites: ['e2e'],
    testMappings: [{
      suite: 'e2e', file: 'test/equipment.e2e-spec.ts',
      title: 'EQUIP-VIEW-04-C returns records of every maintenance status through the real inventory query',
    }],
    edits: [["'WHERE is_available = true'", "\"WHERE is_available = true AND maintenance_status = 'Active'\""]],
  },
];
