export const SUITES = {
  dto: { args: ['run', 'src/equipment/requests/dto/equipment-request-input.spec.ts'] },
  repository: { args: ['run', 'src/equipment/requests/equipment-requests.repository.spec.ts'] },
  service: { args: ['run', 'src/equipment/requests/equipment-requests.service.spec.ts'] },
  controller: { args: ['run', 'src/equipment/requests/equipment-requests.controller.spec.ts'] },
  e2e: { args: ['run', '--config', './vitest.config.e2e.ts', 'test/equipment-requests.e2e-spec.ts'], needsEnv: ['DATABASE_URL'] },
};

export const MUTANTS = [
  {
    id: 'BE-57-14', name: 'request accepts a missing or blank equipment name', file: 'src/equipment/requests/dto/equipment-request-input.ts', suites: ['dto', 'e2e'],
    testMappings: [
      { suite: 'dto', file: 'src/equipment/requests/dto/equipment-request-input.spec.ts', title: 'rejects missing or blank equipment name' },
      { suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-03-N refuses an absent or blank equipment name' },
    ],
    edits: [["if (typeof item.equipmentName !== 'string' || item.equipmentName.trim().length === 0) invalid(`${prefix}.equipmentName`, 'Equipment name is required.');", 'if (false) invalid(`${prefix}.equipmentName`, \'Equipment name is required.\');']],
  },
  {
    id: 'BE-57-15', name: 'reservation persistence stores type instead of the submitted equipment name', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-03-A creates a Pending Review request, exposes it to both lists, and records Approved to Planning' }],
    edits: [["`INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status, equipment_request_item_id)\n           VALUES ($1::uuid, $2, $3, 'Requested', $4::uuid)`,\n          [input.eventId, item.equipmentName, item.quantity, savedItem.rows[0].id],", "`INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status, equipment_request_item_id)\n           VALUES ($1::uuid, $2, $3, 'Requested', $4::uuid)`,\n          [input.eventId, item.equipmentType, item.quantity, savedItem.rows[0].id],"]],
  },
  {
    id: 'BE-57-01', name: 'request quantity accepts zero', file: 'src/equipment/requests/dto/equipment-request-input.ts', suites: ['dto'],
    testMappings: [{ suite: 'dto', file: 'src/equipment/requests/dto/equipment-request-input.spec.ts', title: 'rejects quantity' }],
    edits: [['item.quantity < 1', 'item.quantity < 0']],
  },
  {
    id: 'BE-57-18', name: 'request quantity applies an unsupported maximum of 100', file: 'src/equipment/requests/dto/equipment-request-input.ts', suites: ['dto'],
    testMappings: [{ suite: 'dto', file: 'src/equipment/requests/dto/equipment-request-input.spec.ts', title: 'accepts the maximum PostgreSQL integer quantity' }],
    edits: [['item.quantity > MAX_QUANTITY', 'item.quantity > 100']],
  },
  {
    id: 'BE-57-02', name: 'request permits a missing equipment type', file: 'src/equipment/requests/dto/equipment-request-input.ts', suites: ['dto'],
    testMappings: [{ suite: 'dto', file: 'src/equipment/requests/dto/equipment-request-input.spec.ts', title: 'rejects a missing required item field' }],
    edits: [["if (typeof item.equipmentType !== 'string' || !EQUIPMENT_TYPES.includes(item.equipmentType as EquipmentRequestItemInput['equipmentType'])) invalid(`${prefix}.equipmentType`, 'Choose a valid equipment type.');", 'if (false) invalid(`${prefix}.equipmentType`, \'Choose a valid equipment type.\');']],
  },
  {
    id: 'BE-57-03', name: 'request status no longer transitions from Approved', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['repository', 'e2e'],
    testMappings: [
      { suite: 'repository', file: 'src/equipment/requests/equipment-requests.repository.spec.ts', title: 'creates all requested items and transitions Approved to Planning atomically' },
      { suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'creates a Pending Review request, exposes it to both lists, and records Approved to Planning' },
    ],
    edits: [['shouldTransitionToPlanning(row.status)', 'false']],
  },
  {
    id: 'BE-57-04', name: 'cancelled events accept equipment requests', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-08-N refuses a Cancelled event request without side effects' }],
    edits: [["if (!['Approved', 'Planning'].includes(row.status))", "if (row.status === 'Rejected')"]],
  },
  {
    id: 'BE-57-05', name: 'request list includes requests from other coordinators', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['repository'],
    testMappings: [{ suite: 'repository', file: 'src/equipment/requests/equipment-requests.repository.spec.ts', title: 'groups request items for the coordinator list and review queue' }],
    edits: [["return this.readRequests(\"WHERE e.coordinator_id = $1::text AND e.status NOT IN ('Cancelled', 'Rejected')\", [coordinatorId]);", 'return this.readRequests(\'\', []);']],
  },
  {
    id: 'BE-57-06', name: 'request queue includes non-pending requests', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['repository'],
    testMappings: [{ suite: 'repository', file: 'src/equipment/requests/equipment-requests.repository.spec.ts', title: 'groups request items for the coordinator list and review queue' }],
    edits: [["return this.readRequests(\"WHERE r.status = 'Pending Review' AND e.status NOT IN ('Cancelled', 'Rejected')\", []);", "return this.readRequests('', []);"]],
  },
  {
    id: 'BE-57-09', name: 'request is created when the Approved-to-Planning compare-and-set fails', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['repository'],
    testMappings: [{ suite: 'repository', file: 'src/equipment/requests/equipment-requests.repository.spec.ts', title: 'fails the transaction when the status compare-and-set touches no row' }],
    edits: [["if (!statusChanged) throw new Error('Could not transition the approved event to Planning.');", "if (false) throw new Error('Could not transition the approved event to Planning.');"]],
  },
  {
    id: 'BE-57-10', name: 'coordinator list includes rows belonging to another coordinator', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-06-A isolates coordinator request lists' }],
    edits: [["return this.readRequests(\"WHERE e.coordinator_id = $1::text AND e.status NOT IN ('Cancelled', 'Rejected')\", [coordinatorId]);", "return this.readRequests(\"WHERE e.coordinator_id = $1::text OR TRUE\", [coordinatorId]);"]],
  },
  {
    id: 'BE-57-11', name: 'review queue includes non-Pending Review rows', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-07-A excludes non-Pending Review requests from the support queue' }],
    edits: [["return this.readRequests(\"WHERE r.status = 'Pending Review' AND e.status NOT IN ('Cancelled', 'Rejected')\", []);", "return this.readRequests(\"WHERE r.status = 'Pending Review' OR TRUE\", []);"]],
  },
  {
    id: 'BE-57-12', name: 'confirmation reference does not identify persisted request', file: 'src/equipment/requests/equipment-requests.service.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-05-A returns the persisted request id and reference in confirmation and lists' }],
    edits: [["if (result.kind === 'already-submitted') throw new ConflictException('An equipment request already exists for this event. Update the existing request instead.');\n    return { ...result, requestReference: `ER-${result.id.replaceAll('-', '').slice(0, 8).toUpperCase()}` };", "if (result.kind === 'already-submitted') throw new ConflictException('An equipment request already exists for this event. Update the existing request instead.');\n    return { ...result, requestReference: 'ER-DEADBEEF' };"]],
  },
  {
    id: 'BE-57-13', name: 'coordinator can submit against another coordinator’s eligible event', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-02-N refuses a foreign coordinator event without request or status side effects' }],
    edits: [["FROM events WHERE id = $1::uuid AND coordinator_id = $2::text FOR UPDATE`,\n        [input.eventId, coordinatorId],", "FROM events WHERE id = $1::uuid FOR UPDATE`,\n        [input.eventId],"]],
  },
  {
    id: 'BE-57-16', name: 'legacy equipment requests are not backfilled with an equipment name', file: 'migrations/012_spm57_equipment_requests.sql', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-03-A upgrades legacy technical-requirements rows without losing requests' }],
    edits: [['UPDATE equipment_request_items SET equipment_name = equipment_type WHERE equipment_name IS NULL;', '']],
  },
  {
    id: 'BE-57-17', name: 'legacy technical-requirements column remains after upgrade', file: 'migrations/012_spm57_equipment_requests.sql', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-03-A upgrades legacy technical-requirements rows without losing requests' }],
    edits: [['ALTER TABLE equipment_request_items DROP COLUMN IF EXISTS technical_requirements;', '']],
  },
  {
    id: 'BE-57-19', name: 'request accepts a non-numeric quantity string', file: 'src/equipment/requests/dto/equipment-request-input.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-04-N rejects a non-numeric quantity through HTTP without side effects' }],
    edits: [[
      "if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) invalid(`${prefix}.quantity`, `Quantity must be a whole number between 1 and ${MAX_QUANTITY}.`);",
      "if (typeof item.quantity === 'number' && (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY)) invalid(`${prefix}.quantity`, `Quantity must be a whole number between 1 and ${MAX_QUANTITY}.`);",
    ]],
  },
  {
    id: 'BE-57-20', name: 'request ignores invalid equipment items after the first item', file: 'src/equipment/requests/dto/equipment-request-input.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-04-N rejects a valid-first invalid-second submission without partial writes' }],
    edits: [['const items = body.items.map((candidate, index): EquipmentRequestItemInput => {', 'const items = body.items.slice(0, 1).map((candidate, index): EquipmentRequestItemInput => {']],
  },
  {
    id: 'BE-57-21', name: 'Confirmed event can receive a new equipment request', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-01-N refuses a Confirmed event without request, reservation, or history writes' }],
    edits: [["if (!['Approved', 'Planning'].includes(row.status))", "if (!['Approved', 'Planning', 'Confirmed'].includes(row.status))"]],
  },
  {
    id: 'BE-57-22', name: 'duplicate POST creates a second equipment request', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'refuses a duplicate request while preserving the original request and Approved-to-Planning history' }],
    edits: [["if (existing.rows[0]) return { kind: 'already-submitted' as const };", "if (false && existing.rows[0]) return { kind: 'already-submitted' as const };"]],
  },
  {
    id: 'BE-57-23', name: 'concurrent submits do not serialize on the event row', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-10-BND-1 serializes concurrent submits to one request and side-effect set' }],
    edits: [['AND coordinator_id = $2::text FOR UPDATE', 'AND coordinator_id = $2::text']],
  },
  {
    id: 'BE-57-24', name: 'Confirmed event remains in the eligible-events HTTP response', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-01-N returns only open assigned event names from the eligible-events HTTP endpoint' }],
    edits: [["AND status IN ('Approved', 'Planning')", "AND status IN ('Approved', 'Planning', 'Confirmed')"]],
  },
  {
    id: 'BE-57-25', name: 'coordinator list includes requests for Cancelled or Rejected events', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-08-SUP-HISTORY hides a retained request after its event becomes' }],
    edits: [["return this.readRequests(\"WHERE e.coordinator_id = $1::text AND e.status NOT IN ('Cancelled', 'Rejected')\", [coordinatorId]);", "return this.readRequests(\"WHERE e.coordinator_id = $1::text\", [coordinatorId]);"]],
  },
  {
    id: 'BE-57-26', name: 'Technical Support queue includes requests for Cancelled or Rejected events', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-08-SUP-HISTORY hides a retained request after its event becomes' }],
    edits: [["return this.readRequests(\"WHERE r.status = 'Pending Review' AND e.status NOT IN ('Cancelled', 'Rejected')\", []);", "return this.readRequests(\"WHERE r.status = 'Pending Review'\", []);"]],
  },
  {
    id: 'BE-57-07', name: 'request submission drops the authenticated caller identity', file: 'src/equipment/requests/equipment-requests.controller.ts', suites: ['controller'],
    testMappings: [{ suite: 'controller', file: 'src/equipment/requests/equipment-requests.controller.spec.ts', title: 'forwards a request submission to the service' }],
    edits: [['this.requests.submit(request[CURRENT_USER_REQUEST_KEY], body)', 'this.requests.submit(undefined, body)']],
  },
  {
    id: 'BE-57-08', name: 'equipment request accepts an unauthenticated coordinator', file: 'src/equipment/requests/equipment-requests.service.ts', suites: ['service'],
    testMappings: [{ suite: 'service', file: 'src/equipment/requests/equipment-requests.service.spec.ts', title: 'requires a coordinator session before repository access' }],
    edits: [["private coordinator(user: AuthenticatedUser | undefined): AuthenticatedUser {\n    if (!user?.uid) throw new UnauthorizedException('Authentication required.');", "private coordinator(user: AuthenticatedUser | undefined): AuthenticatedUser {\n    if (false) throw new UnauthorizedException('Authentication required.');"]],
  },
  {
    id: 'BE-57-27', name: 'a Reserved request cannot be updated before event confirmation', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'updates a Reserved request before event confirmation' }],
    edits: [["WHERE r.id = $1::uuid AND e.coordinator_id = $2::text\n          FOR UPDATE OF r, e", "WHERE r.id = $1::uuid AND e.coordinator_id = $2::text AND r.status = 'Pending Review'\n          FOR UPDATE OF r, e"]],
  },
  {
    id: 'BE-57-29', name: 'former coordinator retains list and update access after event reassignment', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-10-SUP-ACCESS follows the current event coordinator after reassignment' }],
    edits: [
      ["WHERE r.id = $1::uuid AND e.coordinator_id = $2::text\n          FOR UPDATE OF r, e", "WHERE r.id = $1::uuid AND r.requested_by = $2::uuid\n          FOR UPDATE OF r, e"],
      ["WHERE e.coordinator_id = $1::text AND e.status NOT IN ('Cancelled', 'Rejected')", "WHERE r.requested_by = $1::uuid AND e.status NOT IN ('Cancelled', 'Rejected')"],
    ],
  },
  {
    id: 'BE-57-28', name: 'Rejected events accept new equipment requests', file: 'src/equipment/requests/equipment-requests.repository.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/equipment-requests.e2e-spec.ts', title: 'EQUIP-REQUEST-08-N refuses a Rejected event request without side effects' }],
    edits: [["if (!['Approved', 'Planning'].includes(row.status))", "if (!['Approved', 'Planning', 'Rejected'].includes(row.status))"]],
  },
];
