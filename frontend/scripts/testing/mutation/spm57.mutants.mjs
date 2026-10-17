export const SUITES = {
  api: { args: ['run', 'src/features/equipment/api/equipment-requests-api.test.ts'] },
  form: { args: ['run', 'src/features/equipment/pages/requests/EquipmentReservationForm.test.tsx'] },
  page: { args: ['run', 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx'] },
};

export const MUTANTS = [
  {
    id: 'FE-57-07', name: 'form accepts an item without a required equipment name', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.tsx', suites: ['form'],
    testMappings: [{ suite: 'form', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.test.tsx', title: 'requires a nonblank equipment name before submission' }],
    edits: [["if (!item.equipmentName.trim()) next[`name-${index}`] = 'Equipment name is required.';", 'if (false) next[`name-${index}`] = \'Equipment name is required.\';']],
  },
  {
    id: 'FE-57-08', name: 'coordinator and support request views omit equipment names', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.tsx', suites: ['page'],
    testMappings: [{ suite: 'page', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx', title: 'shows submitted equipment names in the review queue' }],
    edits: [['{item.equipmentName} · {item.equipmentType} × {item.quantity}', '{item.equipmentType} × {item.quantity}']],
  },
  {
    id: 'FE-57-01', name: 'equipment request uses a PUT API method', file: 'src/features/equipment/api/equipment-requests-api.ts', suites: ['api'],
    testMappings: [{ suite: 'api', file: 'src/features/equipment/api/equipment-requests-api.test.ts', title: 'posts the multi-item request payload' }],
    edits: [["method: 'POST', body: JSON.stringify(input)", "method: 'PUT', body: JSON.stringify(input)"]],
  },
  {
    id: 'FE-57-02', name: 'quantity validation accepts zero', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.tsx', suites: ['form'],
    testMappings: [{ suite: 'form', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.test.tsx', title: 'blocks invalid quantity' }],
    edits: [['quantity < 1', 'quantity < 0']],
  },
  {
    id: 'FE-57-10', name: 'request form applies an unsupported maximum of 100', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.tsx', suites: ['form'],
    testMappings: [{ suite: 'form', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.test.tsx', title: 'submits the maximum PostgreSQL integer quantity' }],
    edits: [['quantity > 2_147_483_647', 'quantity > 100']],
  },
  {
    id: 'FE-57-03', name: 'event date and time context is hidden from the request form', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.tsx', suites: ['form'],
    testMappings: [{ suite: 'form', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.test.tsx', title: 'shows the selected event name, date, time, and expected attendance' }],
    edits: [['{event && <dl', '{false && <dl']],
  },
  {
    id: 'FE-57-04', name: 'cancelled and rejected events remain selectable', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.tsx', suites: ['page'],
    testMappings: [{ suite: 'page', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx', title: 'filters cancelled and rejected events from the selection list' }],
    edits: [["assigned.filter((event) => ['approved', 'planning', 'confirmed'].includes(event.status))", 'assigned.filter(() => true)']],
  },
  {
    id: 'FE-57-05', name: 'successful request omits its confirmation reference', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.tsx', suites: ['page'],
    testMappings: [{ suite: 'page', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx', title: 'submits the selected request, shows its reference, and refreshes both event and request data' }],
    edits: [["setConfirmation(`Equipment request ${result.requestReference} submitted. Status: Pending Review.`);", "setConfirmation('');"]],
  },
  {
    id: 'FE-57-06', name: 'selected event time range is displayed in reverse order', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.tsx', suites: ['form'],
    testMappings: [{ suite: 'form', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.test.tsx', title: 'EQUIP-REQUEST-02-A updates the prefilled event context after selection changes' }],
    edits: [["new Date(event.startDateTime).toLocaleTimeString()} – {new Date(event.endDateTime).toLocaleTimeString()}", "new Date(event.endDateTime).toLocaleTimeString()} – {new Date(event.startDateTime).toLocaleTimeString()}"]],
  },
  {
    id: 'FE-57-09', name: 'removed technical-requirements textarea returns to the request form', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.tsx', suites: ['form'],
    testMappings: [{ suite: 'form', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.test.tsx', title: 'EQUIP-REQUEST-03-A submits multiple independently populated equipment items' }],
    edits: [[
      '<TextInput id={`equipment-request-name-${index}`} label="Equipment name" required value={item.equipmentName}',
      '<label htmlFor={`equipment-request-technical-${index}`}>Technical requirements</label><textarea id={`equipment-request-technical-${index}`} aria-label="Technical requirements" />\n      <TextInput id={`equipment-request-name-${index}`} label="Equipment name" required value={item.equipmentName}',
    ]],
  },
];
