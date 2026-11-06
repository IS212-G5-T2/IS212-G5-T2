// SPM-58 frontend mutants: the Technical Support review queue (AC1, AC2, AC4, AC9) and the reservations view (AC7).
// Run: node scripts/testing/mutation/run.mjs --mutants spm58.mutants.mjs
const PAGE = 'src/features/equipment/pages/requests/EquipmentRequestsPage.tsx';
const PAGE_TEST = 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx';
const EQUIPMENT = 'src/features/equipment/pages/EquipmentPage.tsx';
const EQUIPMENT_TEST = 'src/features/equipment/pages/EquipmentPage.test.tsx';

export const SUITES = {
  page: { args: ['run', PAGE_TEST] },
  equipment: { args: ['run', EQUIPMENT_TEST] },
};

export const MUTANTS = [
  { id: 'FE-58-01', name: 'Cannot provide is submitted without a reason', file: PAGE, suites: ['page'],
    testMappings: [{ suite: 'page', file: PAGE_TEST, title: 'requires a reason before marking a request Cannot provide, then submits it' }],
    edits: [['if (!reason) { setCannotProvideError(', 'if (false) { setCannotProvideError(']] },
  { id: 'FE-58-02', name: 'available equal to requested is shown as insufficient', file: PAGE, suites: ['page'],
    testMappings: [{ suite: 'page', file: PAGE_TEST, title: 'treats an item with no availability figures as sufficient' }],
    edits: [['item.sufficient ?? availableQuantity >= item.quantity', 'item.sufficient ?? availableQuantity > item.quantity']] },
  { id: 'FE-58-03', name: 'the review queue omits the event name', file: PAGE, suites: ['page'],
    testMappings: [{ suite: 'page', file: PAGE_TEST, title: 'renders every required field for a single item at quantity 1' }],
    edits: [['<h2 className="font-medium">{record.eventName}</h2>', '<h2 className="font-medium"></h2>']] },
  { id: 'FE-58-04', name: 'the review queue shows the event end as its start', file: PAGE, suites: ['page'],
    testMappings: [{ suite: 'page', file: PAGE_TEST, title: 'renders every required field for a single item at quantity 1' }],
    edits: [['Start: {new Date(record.eventStart).toLocaleString()}', 'Start: {new Date(record.eventEnd).toLocaleString()}']] },
  { id: 'FE-58-05', name: 'approval stays enabled when an item exceeds availability', file: PAGE, suites: ['page'],
    testMappings: [{ suite: 'page', file: PAGE_TEST, title: 'disables approval when requested quantity exceeds event-period availability' }],
    edits: [['disabled={record.items.some(', 'disabled={false && record.items.some(']] },
  { id: 'FE-58-06', name: 'reservations of different events with the same name are merged', file: EQUIPMENT, suites: ['equipment'],
    testMappings: [{ suite: 'equipment', file: EQUIPMENT_TEST, title: 'keeps records with identical event names separate when their event IDs differ' }],
    edits: [['grouped.get(reservation.eventId)', 'grouped.get(reservation.eventName)'], ['grouped.set(reservation.eventId, {', 'grouped.set(reservation.eventName, {']] },
];
