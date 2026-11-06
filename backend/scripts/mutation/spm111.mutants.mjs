export const SUITES = {
  controller: { args: ['run', 'src/equipment/equipment.controller.spec.ts'] },
};

export const MUTANTS = [{
  id: 'BE-111-01',
  name: 'equipment creation drops the verified caller',
  file: 'src/equipment/equipment.controller.ts',
  suites: ['controller'],
  testMappings: [{
    suite: 'controller',
    file: 'src/equipment/equipment.controller.spec.ts',
    title: 'EQUIP-CRE-04-C delegates equipment creation with the verified caller',
  }],
  edits: [[
    'return this.equipment.create(request[CURRENT_USER_REQUEST_KEY], body);',
    'return this.equipment.create(undefined, body);',
  ]],
}];
