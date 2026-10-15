export const SUITES = {
  service: { args: ['run', 'src/equipment/equipment.service.spec.ts'] },
  controller: { args: ['run', 'src/equipment/equipment.controller.spec.ts'] },
};

export const MUTANTS = [
  {
    id: 'BE-119-01',
    name: 'audit equipment id is replaced with the audit row id',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service'],
    testMappings: [{
      suite: 'service', file: 'src/equipment/equipment.service.spec.ts',
      title: 'SPM-119 AC5 maps every persisted audit-trail field for Technical Support',
    }],
    edits: [['equipmentId: row.equipment_id,', 'equipmentId: row.id,']],
  },
  {
    id: 'BE-119-02',
    name: 'audit trail is sorted oldest first',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service'],
    testMappings: [{
      suite: 'service', file: 'src/equipment/equipment.service.spec.ts',
      title: 'SPM-119 AC5 maps every persisted audit-trail field for Technical Support',
    }],
    edits: [['FROM equipment_audit_trail ORDER BY changed_at DESC', 'FROM equipment_audit_trail ORDER BY changed_at ASC']],
  },
  {
    id: 'BE-119-03',
    name: 'availability controller swaps equipment id and body',
    file: 'src/equipment/equipment.controller.ts',
    suites: ['controller'],
    testMappings: [{
      suite: 'controller', file: 'src/equipment/equipment.controller.spec.ts',
    title: 'EQUIP-UNAVAIL-01-C delegates an availability update without changing its payload',
    }],
    edits: [[
      'return this.equipment.updateAvailability(request[CURRENT_USER_REQUEST_KEY], id, body);',
      'return this.equipment.updateAvailability(request[CURRENT_USER_REQUEST_KEY], String(body), id);',
    ]],
  },
  {
    id: 'BE-119-04',
    name: 'audit controller omits the verified caller',
    file: 'src/equipment/equipment.controller.ts',
    suites: ['controller'],
    testMappings: [{
      suite: 'controller', file: 'src/equipment/equipment.controller.spec.ts',
    title: 'EQUIP-UNAVAIL-05-F delegates the shared equipment audit-trail lookup',
    }],
    edits: [[
      'return this.equipment.getAuditTrail(request[CURRENT_USER_REQUEST_KEY]);',
      'return this.equipment.getAuditTrail(undefined);',
    ]],
  },
  {
    id: 'BE-119-05',
    name: 'repeated availability choices are allowed to write duplicate audit rows',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service'],
    testMappings: [{
      suite: 'service', file: 'src/equipment/equipment.service.spec.ts',
    title: 'EQUIP-UNAVAIL-ASSUMP-03 rejects an availability update when the record already has that state',
    }],
    edits: [[
      'if (before.is_available === input.isAvailable) {',
      'if (false) {',
    ]],
  },
  {
    id: 'BE-119-06',
    name: 'missing equipment is not rejected before the availability transition',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service'],
    testMappings: [{
      suite: 'service', file: 'src/equipment/equipment.service.spec.ts',
      title: 'SPM-119 returns not found when an availability update targets no equipment record',
    }],
    edits: [[
      "if (!before) throw new NotFoundException('Equipment record not found.');",
      'if (false) throw new NotFoundException(\'Equipment record not found.\');',
    ]],
  },
  {
    // AC4: unavailable records are hidden unless the caller explicitly opts in
    // with includeUnavailable=true. Only the literal string 'true' may opt in.
    id: 'BE-119-07',
    name: 'any includeUnavailable query value opts into unavailable records',
    file: 'src/equipment/equipment.controller.ts',
    suites: ['controller'],
    testMappings: [{
      suite: 'controller', file: 'src/equipment/equipment.controller.spec.ts',
      title: 'EQUIP-UNAVAIL-04-F',
    }],
    edits: [["includeUnavailable: includeUnavailable === 'true',", 'includeUnavailable: Boolean(includeUnavailable),']],
  },
];
