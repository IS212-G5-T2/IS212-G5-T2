export const SUITES = {
  service: { args: ['run', 'src/equipment/equipment.service.spec.ts'] },
  controller: { args: ['run', 'src/equipment/equipment.controller.spec.ts'] },
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/equipment-update.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  ...[
    ['BE-118-09', 'type', "if (typeof value.type !== 'string' || value.type.length === 0)", "if (false)", 'EQUIP-UPDATE-03-B rejects an empty type without opening a transaction'],
    ['BE-118-10', 'location', "typeof value.location !== 'string' ||\n    value.location.trim().length === 0", 'false', 'EQUIP-UPDATE-03-B rejects an empty location without opening a transaction'],
    ['BE-118-11', 'maintenance status', "typeof value.maintenanceStatus !== 'string' ||\n    value.maintenanceStatus.length === 0", 'false', 'EQUIP-UPDATE-03-B rejects an empty maintenance status without opening a transaction'],
    ['BE-118-12', 'quantity', "value.quantity === undefined ||\n    value.quantity === null ||\n    value.quantity === ''", 'false', 'EQUIP-UPDATE-03-B rejects an empty quantity without opening a transaction'],
    ['BE-118-13', 'name', "typeof value.name !== 'string' || value.name.trim().length === 0", 'false', 'EQUIP-UPDATE-03-B rejects an empty name without opening a transaction'],
  ].map(([id, field, before, after, title]) => ({
    id,
    name: `update accepts an empty required ${field}`,
    file: 'src/equipment/creation/dto/equipment-input.ts',
    suites: ['service', 'e2e'],
    testMappings: [
      { suite: 'service', file: 'src/equipment/equipment.service.spec.ts', title },
      { suite: 'e2e', file: 'test/equipment-update.e2e-spec.ts', title: 'EQUIP-UPDATE-03-B rejects every empty required field without changing inventory or audit history' },
    ],
    edits: [[before, after]],
  })),
  ...[
    ['BE-118-23', 'quantity validation accepts zero below the minimum', 'value.quantity < 1', 'value.quantity < 0', 'service', 'EQUIP-UPDATE-03-C rejects quantities outside the inclusive integer range before opening a transaction'],
    ['BE-118-24', 'quantity validation accepts a value above the maximum', 'value.quantity > MAX_EQUIPMENT_QUANTITY', 'value.quantity > MAX_EQUIPMENT_QUANTITY + 1', 'service', 'EQUIP-UPDATE-03-C rejects quantities outside the inclusive integer range before opening a transaction'],
    ['BE-118-25', 'quantity validation rejects the inclusive minimum', 'value.quantity < 1', 'value.quantity < 2', 'e2e', 'EQUIP-UPDATE-03-C accepts the inclusive minimum and maximum quantities'],
    ['BE-118-26', 'quantity validation rejects the inclusive maximum', 'value.quantity > MAX_EQUIPMENT_QUANTITY', 'value.quantity >= MAX_EQUIPMENT_QUANTITY', 'e2e', 'EQUIP-UPDATE-03-C accepts the inclusive minimum and maximum quantities'],
  ].map(([id, name, before, after, suite, title]) => ({
    id,
    name,
    file: 'src/equipment/creation/dto/equipment-input.ts',
    suites: [suite],
    testMappings: [{
      suite,
      file: suite === 'service' ? 'src/equipment/equipment.service.spec.ts' : 'test/equipment-update.e2e-spec.ts',
      title,
    }],
    edits: [[before, after]],
  })),
  ...[
    ['BE-118-14', 'name', 'input.name', 'input.type'],
    ['BE-118-15', 'type', 'input.type', 'input.name'],
    ['BE-118-16', 'location', 'input.location', 'input.name'],
    ['BE-118-17', 'maintenance status', 'input.maintenanceStatus', 'input.type'],
    ['BE-118-18', 'quantity', 'input.quantity', '5'],
  ].map(([id, field, before, after]) => ({
    id,
    name: `database update maps the requested ${field} to the wrong persisted value`,
    file: 'src/equipment/equipment.service.ts',
    suites: ['service', 'e2e'],
    testMappings: [
      { suite: 'service', file: 'src/equipment/equipment.service.spec.ts', title: 'EQUIP-UPDATE-02-A updates all allowed values and writes an audit snapshot atomically' },
      { suite: 'e2e', file: 'test/equipment-update.e2e-spec.ts', title: 'EQUIP-UPDATE-05-A returns the updated record from the subsequent inventory read' },
    ],
    edits: [[
      `          equipmentId,\n          input.name,\n          input.type,\n          input.location,\n          input.maintenanceStatus,\n          input.quantity,`,
      `          equipmentId,\n          ${before === 'input.name' ? after : 'input.name'},\n          ${before === 'input.type' ? after : 'input.type'},\n          ${before === 'input.location' ? after : 'input.location'},\n          ${before === 'input.maintenanceStatus' ? after : 'input.maintenanceStatus'},\n          ${before === 'input.quantity' ? after : 'input.quantity'},`,
    ]],
  })),
  ...[
    ['BE-118-19', 'description', 'description'],
    ['BE-118-20', 'specifications', 'specifications'],
  ].map(([id, field, property]) => ({
    id,
    name: `unsupported ${field} property is added to the database update`,
    file: 'src/equipment/equipment.service.ts',
    suites: ['service', 'e2e'],
    testMappings: [
      { suite: 'service', file: 'src/equipment/equipment.service.spec.ts', title: 'EQUIP-UPDATE-02-B ignores retired Description and Specifications properties' },
      { suite: 'e2e', file: 'test/equipment-update.e2e-spec.ts', title: 'EQUIP-UPDATE-02-B ignores retired Description and Specifications properties' },
    ],
    edits: [
      ['maintenance_status = $5, quantity = $6, updated_at = now()', `maintenance_status = $5, quantity = $6, ${property} = $7, updated_at = now()`],
      ['          input.maintenanceStatus,\n          input.quantity,\n        ],', `          input.maintenanceStatus,\n          input.quantity,\n          (body as Record<string, unknown>).${property},\n        ],`],
    ],
  })),
  {
    id: 'BE-118-07',
    name: 'equipment update controller omits the authenticated caller',
    file: 'src/equipment/equipment.controller.ts',
    suites: ['controller'],
    testMappings: [{
      suite: 'controller', file: 'src/equipment/equipment.controller.spec.ts',
      title: 'EQUIP-UPDATE-02-A delegates a record update with the verified caller',
    }],
    edits: [['this.equipment.update(request[CURRENT_USER_REQUEST_KEY], id, body)', 'this.equipment.update(undefined, id, body)']],
  },
  {
    id: 'BE-118-08',
    name: 'HTTP update records the wrong audit event type',
    file: 'src/equipment/equipment.service.ts',
    suites: ['e2e'],
    testMappings: [{
      suite: 'e2e', file: 'test/equipment-update.e2e-spec.ts',
      title: 'EQUIP-UPDATE-06-A persists editable values and records the change with the authenticated actor',
    }],
    edits: [[
      "'Equipment record updated', $8, $9)",
      "'Equipment unavailable', $8, $9)",
    ]],
  },
  {
    id: 'BE-118-01',
    name: 'unchanged values still write a duplicate audit event',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service', 'e2e'],
    testMappings: [
      { suite: 'service', file: 'src/equipment/equipment.service.spec.ts', title: 'EQUIP-UPDATE-06-C returns the unchanged record without adding an audit entry' },
      { suite: 'e2e', file: 'test/equipment-update.e2e-spec.ts', title: 'EQUIP-UPDATE-06-C does not write an audit row for unchanged values' },
    ],
    edits: [['if (changedFields.length === 0) {', 'if (false) {']],
  },
  {
    id: 'BE-118-02',
    name: 'equipment updates do not write an audit snapshot',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service'],
    testMappings: [{
      suite: 'service', file: 'src/equipment/equipment.service.spec.ts',
      title: 'EQUIP-UPDATE-02-A updates all allowed values and writes an audit snapshot atomically',
    }],
    edits: [[
      'const record = updated.rows[0];\n      await client.query(',
      "const record = updated.rows[0];\n      if (false) await client.query(",
    ]],
  },
  {
    id: 'BE-118-03',
    name: 'equipment update audit attributes the change to a different user',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service'],
    testMappings: [{
      suite: 'service', file: 'src/equipment/equipment.service.spec.ts',
      title: 'EQUIP-UPDATE-02-A updates all allowed values and writes an audit snapshot atomically',
    }],
    edits: [[
      "record.is_available,\n          `Updated fields: ${changedFields.join(', ')}.`,\n          actor.email,",
      "record.is_available,\n          `Updated fields: ${changedFields.join(', ')}.`,\n          'other@example.test',",
    ]],
  },
  {
    id: 'BE-118-04',
    name: 'equipment update omits the requested quantity',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service'],
    testMappings: [{
      suite: 'service', file: 'src/equipment/equipment.service.spec.ts',
      title: 'EQUIP-UPDATE-02-A updates all allowed values and writes an audit snapshot atomically',
    }],
    edits: [['maintenance_status = $5, quantity = $6', 'maintenance_status = $5']],
  },
  {
    id: 'BE-118-05',
    name: 'equipment update skips the Technical Support role check',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service'],
    testMappings: [{
      suite: 'service', file: 'src/equipment/equipment.service.spec.ts',
      title: 'EQUIP-UPDATE-01-C refuses non-Technical-Support roles before opening a persistence transaction',
    }],
    edits: [['const actor = requireTechnicalSupport(user);\n    const input = validateEquipmentInput(body);', 'const actor = user!;\n    const input = validateEquipmentInput(body);']],
  },
  {
    id: 'BE-118-06',
    name: 'missing equipment is allowed to proceed into the update query',
    file: 'src/equipment/equipment.service.ts',
    suites: ['service', 'e2e'],
    testMappings: [
      { suite: 'service', file: 'src/equipment/equipment.service.spec.ts', title: 'EQUIP-UPDATE-01-A reports a missing equipment record without writing' },
      { suite: 'e2e', file: 'test/equipment-update.e2e-spec.ts', title: 'EQUIP-UPDATE-01-B distinguishes missing and malformed equipment ids' },
    ],
    edits: [[
      "const before = current.rows[0];\n      if (!before) throw new NotFoundException('Equipment record not found.');\n\n      const changedFields =",
      "const before = current.rows[0];\n      if (false) throw new NotFoundException('Equipment record not found.');\n\n      const changedFields =",
    ]],
  },
  {
    id: 'BE-118-21',
    name: 'equipment update skips Technical Support authorization',
    file: 'src/equipment/equipment.service.ts',
    suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-update.e2e-spec.ts', title: 'EQUIP-UPDATE-01-C returns 401 for anonymous callers and 403 for another role' }],
    edits: [['const actor = requireTechnicalSupport(user);\n    const input = validateEquipmentInput(body);', 'const actor = user!;\n    const input = validateEquipmentInput(body);']],
  },
  {
    id: 'BE-118-22',
    name: 'equipment update commits even when audit insertion fails',
    file: 'src/equipment/equipment.service.ts',
    suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-update.e2e-spec.ts', title: 'EQUIP-UPDATE-06-B leaves inventory unchanged when audit persistence fails' }],
    edits: [[
      '          actor.email,\n        ],\n      );\n\n      return {\n        equipment: toEquipment(record),',
      '          actor.email,\n        ],\n      ).catch(() => undefined);\n\n      return {\n        equipment: toEquipment(record),',
    ]],
  },
];
