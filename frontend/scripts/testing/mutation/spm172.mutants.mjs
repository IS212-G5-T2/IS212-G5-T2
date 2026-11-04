// SPM-172 frontend mutants: the Coordinator's equipment request decision notices in the top-bar bell (which types the bell
// lists, the /equipment/requests?request=<id> link and its fallback, mark-read on opening) and the equipment requests page that
// highlights the linked request (marker, scroll, unknown id, loading and failed-load states).
// Each mutant maps to its EQUIP-REQ-NOTIF test by ID prefix; the runner matches the prefix by name.
const BELL_TEST = 'src/components/notifications/NotificationBell.test.tsx';
const PAGE_TEST = 'src/features/equipment/pages/requests/EquipmentRequestsPage.test.tsx';
const BELL = 'src/components/notifications/NotificationBell.tsx';
const ROW = 'src/components/notifications/NotificationRow.tsx';
const PAGE = 'src/features/equipment/pages/requests/EquipmentRequestsPage.tsx';
const bell = (...ids) => ids.map((id) => ({ suite: 'equipmentNotices', file: BELL_TEST, title: `EQUIP-REQ-NOTIF-${id} ` }));
const page = (...ids) => ids.map((id) => ({ suite: 'equipmentNotices', file: PAGE_TEST, title: `EQUIP-REQ-NOTIF-${id} ` }));

export const SUITES = {
  equipmentNotices: {
    args: ['run', BELL_TEST, PAGE_TEST],
  },
};

export const MUTANTS = [
  {
    id: 'SPM172-FE-01',
    name: "the Coordinator's bell lists neither equipment decision type",
    file: BELL,
    suites: ['equipmentNotices'],
    testMappings: bell('01-G', '02-F', '03-C', '03-D', '03-E', '04-C', '04-D'),
    edits: [['  "equipment_request_reserved",\n  "equipment_request_cannot_provide",\n', '']],
  },
  {
    id: 'SPM172-FE-02',
    name: "the Coordinator's bell lists reserved notices but not cannot-provide ones",
    file: BELL,
    suites: ['equipmentNotices'],
    testMappings: bell('01-G', '02-F', '03-D'),
    edits: [['  "equipment_request_cannot_provide",\n', '']],
  },
  {
    id: 'SPM172-FE-03',
    name: 'an equipment notice links to the event page instead of the equipment requests page',
    file: ROW,
    suites: ['equipmentNotices'],
    testMappings: bell('03-C', '03-D', '03-E'),
    edits: [['const isEquipment = EQUIPMENT_NOTICES.has(n.type);', 'const isEquipment = false;']],
  },
  {
    id: 'SPM172-FE-04',
    name: 'an equipment notice links to /equipment/requests without the request id',
    file: ROW,
    suites: ['equipmentNotices'],
    testMappings: bell('03-C', '03-D'),
    edits: [['`/equipment/requests?request=${encodeURIComponent(n.relatedEquipmentRequestId)}`', '"/equipment/requests"']],
  },
  {
    id: 'SPM172-FE-05',
    name: 'the request id in the link is not escaped',
    file: ROW,
    suites: ['equipmentNotices'],
    testMappings: bell('03-D'),
    edits: [['request=${encodeURIComponent(n.relatedEquipmentRequestId)}', 'request=${n.relatedEquipmentRequestId}']],
  },
  {
    id: 'SPM172-FE-06',
    name: 'a notice with no request id links to ?request=undefined',
    file: ROW,
    suites: ['equipmentNotices'],
    testMappings: bell('03-E'),
    edits: [['  return n.relatedEquipmentRequestId\n', '  return true\n']],
  },
  {
    id: 'SPM172-FE-07',
    name: 'opening an equipment notice does not mark it read',
    file: ROW,
    suites: ['equipmentNotices'],
    testMappings: bell('03-C'),
    edits: [['if (!isChangeRequest) onMarkRead(n.id);', 'if (!isChangeRequest && !isEquipment) onMarkRead(n.id);']],
  },
  {
    id: 'SPM172-FE-08',
    name: 'the linked request is not marked',
    file: PAGE,
    suites: ['equipmentNotices'],
    testMappings: page('03-F', '03-G'),
    edits: [["aria-current={record.id === linkedRequestId ? 'true' : undefined}", 'aria-current={undefined}']],
  },
  {
    id: 'SPM172-FE-09',
    name: 'every request is marked as the linked one',
    file: PAGE,
    suites: ['equipmentNotices'],
    testMappings: page('03-F'),
    edits: [["aria-current={record.id === linkedRequestId ? 'true' : undefined}", "aria-current={'true'}"]],
  },
  {
    id: 'SPM172-FE-10',
    name: 'the linked request is not scrolled into view',
    file: PAGE,
    suites: ['equipmentNotices'],
    testMappings: page('03-F'),
    edits: [["card.scrollIntoView?.({ block: 'center' });", '']],
  },
  {
    id: 'SPM172-FE-10B',
    name: 'the linked request is scrolled to again after every refresh',
    file: PAGE,
    suites: ['equipmentNotices'],
    testMappings: page('03-F'),
    edits: [['|| scrolledRequestId.current === linkedRequestId) return;', ') return;']],
  },
  {
    id: 'SPM172-FE-11',
    name: 'the page reads the wrong query parameter for the linked request',
    file: PAGE,
    suites: ['equipmentNotices'],
    testMappings: page('03-F', '03-G', '03-H'),
    edits: [["searchParams.get('request')", "searchParams.get('requestId')"]],
  },
  {
    id: 'SPM172-FE-12',
    name: 'the missing-request notice is never shown',
    file: PAGE,
    suites: ['equipmentNotices'],
    testMappings: page('03-H'),
    edits: [['const linkedMissing = Boolean(linkedRequestId) &&', 'const linkedMissing = false &&']],
  },
  {
    id: 'SPM172-FE-13',
    name: 'the missing-request notice is shown while the list is still loading',
    file: PAGE,
    suites: ['equipmentNotices'],
    testMappings: page('03-I'),
    edits: [['Boolean(linkedRequestId) && !loading && !error', 'Boolean(linkedRequestId) && !error']],
  },
  {
    id: 'SPM172-FE-14',
    name: 'the missing-request notice is shown after the list failed to load',
    file: PAGE,
    suites: ['equipmentNotices'],
    testMappings: page('03-I'),
    edits: [['Boolean(linkedRequestId) && !loading && !error', 'Boolean(linkedRequestId) && !loading']],
  },
  {
    id: 'SPM172-FE-15',
    name: 'the missing-request notice is shown when the page was not opened from a notice',
    file: PAGE,
    suites: ['equipmentNotices'],
    testMappings: page('03-I'),
    edits: [['Boolean(linkedRequestId) && !loading', '!loading']],
  },
  {
    id: 'SPM172-FE-16',
    name: 'the linked request card loses its visible highlight ring (aria-current kept)',
    file: PAGE,
    suites: ['equipmentNotices'],
    testMappings: page('03-F'),
    edits: [["className={record.id === linkedRequestId ? 'ring-2 ring-primary-500' : undefined}", 'className={undefined}']],
  },
];
