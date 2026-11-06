export const SUITES = {
  api: { args: ['run', 'src/features/equipment/api/equipment-requests-api.test.ts'] },
  form: { args: ['run', 'src/features/equipment/pages/requests/EquipmentReservationForm.test.tsx'] },
  page: { args: ['run', 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx'] },
  editor: { args: ['run', 'src/features/equipment/pages/requests/EquipmentRequestEditorPage.test.tsx'] },
  app: { args: ['run', 'src/app/App.test.tsx'] },
};

export const MUTANTS = [
  {
    id: 'FE-57-07', name: 'form accepts an item without a required equipment name', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.tsx', suites: ['form'],
    testMappings: [{ suite: 'form', file: 'src/features/equipment/pages/requests/EquipmentReservationForm.test.tsx', title: 'requires a nonblank equipment name before submission' }],
    edits: [["if (!item.equipmentName.trim()) next[`name-${index}`] = 'Equipment name is required.';", 'if (false) next[`name-${index}`] = \'Equipment name is required.\';']],
  },
  {
    id: 'FE-57-08', name: 'coordinator and support request views omit equipment names', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.tsx', suites: ['page'],
    testMappings: [{ suite: 'page', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx', title: 'loads the Technical Support review queue without coordinator actions' }],
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
    id: 'FE-57-04', name: 'closed events remain selectable', file: 'src/features/equipment/pages/requests/EquipmentRequestEditorPage.tsx', suites: ['editor'],
    testMappings: [{ suite: 'editor', file: 'src/features/equipment/pages/requests/EquipmentRequestEditorPage.test.tsx', title: 'offers only request-eligible events on the create page' }],
    edits: [["const openStatuses = ['approved', 'planning'];", "const openStatuses = ['approved', 'planning', 'cancelled', 'rejected'];"]],
  },
  {
    id: 'FE-57-05', name: 'successful create omits the submitted reference from the confirmation route', file: 'src/features/equipment/pages/requests/EquipmentRequestEditorPage.tsx', suites: ['editor'],
    testMappings: [{ suite: 'editor', file: 'src/features/equipment/pages/requests/EquipmentRequestEditorPage.test.tsx', title: 'renders a dedicated create form with event context and returns after submission' }],
    edits: [["navigate(`/equipment/requests?submitted=${encodeURIComponent(result.requestReference)}`);", "navigate('/equipment/requests');"]],
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
  {
    id: 'FE-57-11', name: 'create editor offers an event that already has a request', file: 'src/features/equipment/pages/requests/EquipmentRequestEditorPage.tsx', suites: ['editor'],
    testMappings: [{ suite: 'editor', file: 'src/features/equipment/pages/requests/EquipmentRequestEditorPage.test.tsx', title: 'prevents creating another request for an event already in My Equipment Requests' }],
    edits: [[": events.filter((event) => !requests.some((record) => record.eventId === event.id));", ': events;']],
  },
  {
    id: 'FE-57-12', name: 'support staff can open coordinator-only equipment request editors', file: 'src/app/App.tsx', suites: ['app'],
    testMappings: [{ suite: 'app', file: 'src/app/App.test.tsx', title: 'keeps create and update editor routes restricted to coordinators' }],
    edits: [['<Route element={<RequireRole allowedRoles={["coordinator"]} />}>\n          <Route path="/equipment/requests/create"', '<Route element={<RequireRole allowedRoles={["coordinator", "tech_support"]} />}>\n          <Route path="/equipment/requests/create"']],
  },
  {
    id: 'FE-57-13', name: 'update route no longer resolves request-specific editor', file: 'src/app/App.tsx', suites: ['app'],
    testMappings: [{ suite: 'app', file: 'src/app/App.test.tsx', title: 'routes coordinators to a request-specific update form page' }],
    edits: [['<Route path="/equipment/requests/:requestId/update" element={<EquipmentRequestEditorPage />} />', '<Route path="/equipment/requests/:requestId/edit" element={<EquipmentRequestEditorPage />} />']],
  },
  {
    id: 'FE-57-14', name: 'Confirmed events remain available in the create picker', file: 'src/features/equipment/pages/requests/EquipmentRequestEditorPage.tsx', suites: ['editor'],
    testMappings: [{ suite: 'editor', file: 'src/features/equipment/pages/requests/EquipmentRequestEditorPage.test.tsx', title: 'offers only request-eligible events on the create page' }],
    edits: [["const openStatuses = ['approved', 'planning'];", "const openStatuses = ['approved', 'planning', 'confirmed'];"]],
  },
  {
    id: 'FE-57-15', name: 'Update Event is hidden after an equipment request is Reserved', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.tsx', suites: ['page'],
    testMappings: [{ suite: 'page', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx', title: 'shows Update Event when the request is Reserved and its event is still Planning' }],
    edits: [['{isCoordinator && updatableEventStatuses.has(record.eventStatus) && <Link', "{isCoordinator && record.status === 'Pending Review' && updatableEventStatuses.has(record.eventStatus) && <Link"]],
  },
  {
    id: 'FE-57-16', name: 'a list refresh failure leaves previously loaded request cards visible', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.tsx', suites: ['page'],
    testMappings: [{ suite: 'page', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx', title: 'clears previously loaded request cards when a role-specific refresh fails' }],
    edits: [["    } catch (e) {\n      setRequests([]);\n      setError(e instanceof Error ? e.message : 'Could not load equipment requests.');", "    } catch (e) {\n      setError(e instanceof Error ? e.message : 'Could not load equipment requests.');"]],
  },
  {
    id: 'FE-57-17', name: 'equipment request list failures do not show an error state', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.tsx', suites: ['page'],
    testMappings: [
      { suite: 'page', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx', title: 'shows an error when the request list cannot load' },
      { suite: 'page', file: 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx', title: 'shows a safe fallback when the request list fails without an Error object' },
    ],
    edits: [["      setError(e instanceof Error ? e.message : 'Could not load equipment requests.');", '      void e;']],
  },
];
