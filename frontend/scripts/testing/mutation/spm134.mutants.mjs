// SPM-134 frontend mutants: the Coordinator's tentative hold reminder, expired, released and converted notices in the
// top-bar bell (which types the bell lists, the /bookings?booking=<id> link) and the details dialog the link opens (a
// released hold shows its expiry as "Hold expiry", a converted hold shows none). The row icon in NotificationItem has no
// mutant: that component is not rendered by the app and is deliberately untested (owner decision, 3 Nov 2026).
// Each mutant maps to its HOLD-EXP-NOTIF test by ID prefix; the runner matches the prefix by name.
const BELL_TEST = 'src/components/notifications/NotificationBell.test.tsx';
const PAGE_TEST = 'src/features/bookings/pages/requests/BookingsPage.test.tsx';
const BELL = 'src/components/notifications/NotificationBell.tsx';
const ROW = 'src/components/notifications/NotificationRow.tsx';
const TYPES = 'src/types/index.ts';
const DIALOG = 'src/features/bookings/pages/requests/CoordinatorBookingDialog.tsx';
const bell = (...ids) => ids.map((id) => ({ suite: 'holdLifecycle', file: BELL_TEST, title: `HOLD-EXP-NOTIF-${id} ` }));
const page = (...ids) => ids.map((id) => ({ suite: 'holdLifecycle', file: PAGE_TEST, title: `HOLD-EXP-NOTIF-${id} ` }));

export const SUITES = {
  holdLifecycle: {
    args: ['run', BELL_TEST, PAGE_TEST],
  },
};

export const MUTANTS = [
  {
    id: 'SPM134-FE-01',
    name: "the Coordinator's bell lists none of the four hold lifecycle types",
    file: BELL,
    suites: ['holdLifecycle'],
    testMappings: bell('01-H', '02-E', '03-G', '04-D', '06-B', '07-B', '08-B'),
    edits: [['  ...HOLD_LIFECYCLE_NOTICE_TYPES,\n', '']],
  },
  {
    id: 'SPM134-FE-02',
    name: 'the row no longer treats hold lifecycle types as booking notices, so they link to the event page',
    file: ROW,
    suites: ['holdLifecycle'],
    testMappings: bell('06-B', '08-B'),
    edits: [['  ...HOLD_LIFECYCLE_NOTICE_TYPES,\n', '']],
  },
  {
    id: 'SPM134-FE-03',
    name: 'the shared type list leaves out the expired type',
    file: TYPES,
    suites: ['holdLifecycle'],
    testMappings: bell('02-E', '04-D', '06-B'),
    edits: [['  "tentative_hold_expired",\n  "tentative_hold_released",', '  "tentative_hold_released",']],
  },
  {
    id: 'SPM134-FE-04',
    name: 'the shared type list leaves out the released type',
    file: TYPES,
    suites: ['holdLifecycle'],
    testMappings: bell('03-G', '04-D', '06-B', '08-B'),
    edits: [['  "tentative_hold_released",\n  "tentative_hold_converted",\n] as const', '  "tentative_hold_converted",\n] as const']],
  },
  {
    id: 'SPM134-FE-05',
    name: 'the details of a released hold show no expiry',
    file: DIALOG,
    suites: ['holdLifecycle'],
    testMappings: page('06-E'),
    edits: [[' || booking.status === "released") && booking.holdExpiresAt', ') && booking.holdExpiresAt']],
  },
  {
    id: 'SPM134-FE-06',
    name: 'the expiry of a released hold is labelled "Hold expires" or "Hold expired" instead of "Hold expiry"',
    file: DIALOG,
    suites: ['holdLifecycle'],
    testMappings: page('06-E'),
    edits: [['booking.status === "released" ? "Hold expiry" : ', '']],
  },
  {
    id: 'SPM134-FE-07',
    name: 'the details of a converted booking show a stale hold expiry',
    file: DIALOG,
    suites: ['holdLifecycle'],
    testMappings: page('06-F'),
    edits: [['{booking.requestKind === "tentative_hold" && (booking.status === "approved" ||', '{(booking.status === "approved" ||']],
  },
  {
    id: 'SPM134-FE-08',
    name: 'the details of an expired hold are labelled as still expiring',
    file: DIALOG,
    suites: ['holdLifecycle'],
    testMappings: page('06-C', '06-D'),
    edits: [['booking.holdExpired ? "Hold expired" : "Hold expires"', '"Hold expires"']],
  },
];
