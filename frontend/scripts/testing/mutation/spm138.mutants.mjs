// SPM-138 frontend mutants, run by the frontend runner:  node scripts/testing/mutation/run.mjs --mutants spm138.mutants.mjs
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Every mutant names the waiting-list test that must go red (testMappings). Titles are matched by --testNamePattern.
export const SUITES = {
  // The SPM-138 specs and the dashboard list test that asserts the registration badge.
  spm138: {
    args: [
      'run',
      'src/features/events/lib/waitlist.test.ts',
      'src/features/events/pages/detail/registration/WaitlistPanel.test.tsx',
      'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx',
      'src/features/events/pages/list/EventCard.waitlist.test.tsx',
      'src/store/useAppStore.waitlist.test.ts',
      'src/features/events/pages/list/EventListPage.test.tsx',
      'src/features/events/lib/registration.test.ts',
      'src/components/notifications/WaitlistNotifications.test.tsx',
      'src/components/layout/AppShell.waitlist.test.tsx',
    ],
  },
};

const RULES = 'src/features/events/lib/registration.ts';
const PANEL = 'src/features/events/pages/detail/registration/WaitlistPanel.tsx';
const SECTION = 'src/features/events/pages/detail/registration/RegistrationSection.tsx';
const STORE = 'src/store/useAppStore.ts';
const BADGE = 'src/components/ui/StatusBadge.tsx';
const LIST = 'src/features/events/pages/list/EventListPage.tsx';
const suites = ['spm138'];

const FILES = {
  'JOIN-WAITLIST-09-C-FE-MOUNT': 'src/components/layout/AppShell.waitlist.test.tsx',
  'JOIN-WAITLIST-09-C-FE-STATE-READ': 'src/components/layout/AppShell.waitlist.test.tsx',
  'JOIN-WAITLIST-09-C-FE-STATE-MARK': 'src/components/layout/AppShell.waitlist.test.tsx',
  'JOIN-WAITLIST-09-C-FE-ERR-LOAD': 'src/components/layout/AppShell.waitlist.test.tsx',
  'JOIN-WAITLIST-09-C-FE': 'src/components/notifications/WaitlistNotifications.test.tsx',
  'JOIN-WAITLIST-07-E-FE': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx',
  'JOIN-WAITLIST-03-A-FE-LIST': 'src/features/events/pages/list/EventListPage.test.tsx',
  'JOIN-WAITLIST-11-C-FE': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx','JOIN-WAITLIST-02-B-INT-UNIT': 'src/features/events/lib/waitlist.test.ts', 'JOIN-WAITLIST-01-E-FE-STATE-PENDING': 'src/features/events/pages/detail/registration/WaitlistPanel.test.tsx', 'JOIN-WAITLIST-04-A-FE': 'src/features/events/pages/detail/registration/WaitlistPanel.test.tsx', 'JOIN-WAITLIST-01-E-FE-INT-SAMETICK': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', 'JOIN-WAITLIST-01-E-FE-ERR-REFRESH': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', 'JOIN-WAITLIST-02-A-FE': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', 'JOIN-WAITLIST-11-A-FE': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', 'JOIN-WAITLIST-01-F-STORE-ERR': 'src/store/useAppStore.waitlist.test.ts', 'JOIN-WAITLIST-01-A-STORE': 'src/store/useAppStore.waitlist.test.ts', 'JOIN-WAITLIST-03-A-FE-STATE-DASH': 'src/features/events/pages/list/EventCard.waitlist.test.tsx', 'JOIN-WAITLIST-03-A-FE-VARIANT': 'src/features/events/pages/list/EventCard.waitlist.test.tsx', 'gives attendees personal filters and a Registered badge': 'src/features/events/pages/list/EventListPage.test.tsx'};
const tm = (title) => ({ suite: 'spm138', file: FILES[title], title });

export const MUTANTS = [
  { id: 'F1', name: 'an open, full event answers register instead of full-join', file: RULES, suites,
    edits: [['  return full ? "full-join" : "register";', '  return full ? "register" : "full-join";']],
    testMappings: [tm('JOIN-WAITLIST-02-B-INT-UNIT')] },
  { id: 'F2', name: 'a waiting entry on a closed window is shown as closed (precedence swapped)', file: RULES, suites,
    edits: [['  if (myStatus === "waitlisted") return "waitlisted";', '  if (myStatus === "waitlisted" && window !== "closed") return "waitlisted";']],
    testMappings: [tm('JOIN-WAITLIST-02-B-INT-UNIT')] },
  { id: 'F3', name: 'the Join control is not disabled while the request is pending', file: PANEL, suites,
    edits: [['<Button variant="secondary" disabled={pending} aria-busy={pending} onClick={onJoin}>', '<Button variant="secondary" onClick={onJoin}>']],
    testMappings: [tm('JOIN-WAITLIST-01-E-FE-STATE-PENDING')] },
  { id: 'F4', name: 'the banner is shown even without a joined position', file: PANEL, suites,
    edits: [['      {joinedPosition !== null && (', '      {true && (']],
    testMappings: [tm('JOIN-WAITLIST-04-A-FE')] },
  { id: 'F5', name: 'Dismiss does not dismiss the banner', file: PANEL, suites,
    edits: [['<Button variant="ghost" size="sm" onClick={onDismissBanner}>', '<Button variant="ghost" size="sm" onClick={() => undefined}>']],
    testMappings: [tm('JOIN-WAITLIST-04-A-FE')] },
  { id: 'F6', name: 'the in-flight guard is removed (a same-batch double click sends two requests)', file: SECTION, suites,
    edits: [['    if (joinInFlight.current) return;\n', '']],
    testMappings: [tm('JOIN-WAITLIST-01-E-FE-INT-SAMETICK')] },
  { id: 'F7', name: 'a 409 or closed refusal does not read the attendee\'s entry again', file: SECTION, suites,
    edits: [['      if (code === "already_on_waitlist" || code === "already_registered" || code === "registration_closed" || code === "registration_not_open") {',
             '      if (false as boolean) {']],
    testMappings: [tm('JOIN-WAITLIST-01-E-FE-ERR-REFRESH')] },
  { id: 'F8', name: 'the availability line reports the spots left as the limit', file: SECTION, suites,
    edits: [['value: `${Math.max(spots, 0)} of ${limit} available`', 'value: `${Math.max(spots, 0)} of ${Math.max(spots, 0)} available`']],
    testMappings: [tm('JOIN-WAITLIST-02-A-FE')] },
  { id: 'F9', name: 'the store join accepts a non-attendee (role guard removed)', file: STORE, suites,
    edits: [['    if (!get().isAuthenticated || user.role !== "attendee") {\n      throw new Error("Only signed-in attendees can join the waiting list.");',
             '    if (false as boolean) {\n      throw new Error("Only signed-in attendees can join the waiting list.");']],
    testMappings: [tm('JOIN-WAITLIST-01-F-STORE-ERR')] },
  { id: 'F10', name: 'the store join sends no JSON body', file: STORE, suites,
    edits: [['      body: JSON.stringify({}),\n    });\n    await get().loadMyRegistration(eventId);', '    });\n    await get().loadMyRegistration(eventId);']],
    testMappings: [tm('JOIN-WAITLIST-01-A-STORE')] },
  { id: 'F11', name: 'the store join does not refresh the attendee\'s own entry', file: STORE, suites,
    edits: [['    await get().loadMyRegistration(eventId);\n    return result;', '    return result;']],
    testMappings: [tm('JOIN-WAITLIST-01-A-STORE')] },
  { id: 'F12', name: 'the Waitlisted badge reads Confirmed', file: BADGE, suites,
    edits: [['  waitlisted: "Waitlisted",', '  waitlisted: "Confirmed",']],
    testMappings: [tm('JOIN-WAITLIST-03-A-FE-STATE-DASH'), tm('JOIN-WAITLIST-03-A-FE-VARIANT')] },
  { id: 'F13', name: 'the registered badge reads Registered (the D3 relabel is reverted)', file: BADGE, suites,
    edits: [['  registered: "Confirmed",', '  registered: "Registered",']],
    testMappings: [tm('gives attendees personal filters and a Registered badge')] },
  { id: 'F15', name: 'the dashboard stops passing the waiting status to the card', file: LIST, suites,
    edits: [['registrationStatus={isAttendee && e.myRegistrationStatus === "waitlisted" ? "waitlisted" : undefined}', 'registrationStatus={undefined}']],
    testMappings: [tm('JOIN-WAITLIST-03-A-FE-LIST')] },
  { id: 'F16', name: 'the registration-disabled guard is dropped (the normal state logic runs for a disabled event)', file: SECTION, suites,
    edits: [['  if (!event.registrationEnabled) {', '  if (false as boolean) {']],
    testMappings: [tm('JOIN-WAITLIST-11-C-FE')] },
  { id: 'F17', name: 'the withdrawn suppression on the waiting list panel is restored (no rejoin from a withdrawn card)', file: SECTION, suites,
    edits: [['|| joinError) && (', '|| joinError) && !withdrawn && (']],
    testMappings: [tm('JOIN-WAITLIST-07-E-FE')] },
  { id: 'F18', name: 'the attendee notice never loads (its feed is disabled), so no promotion notice shows', file: 'src/components/notifications/WaitlistNotifications.tsx', suites,
    edits: [['    enabled: user.role === "attendee",', '    enabled: false,']],
    testMappings: [tm('JOIN-WAITLIST-09-C-FE')] },
  { id: 'Y4', name: 'the attendee notice component is removed from the app shell', file: 'src/components/layout/AppShell.tsx', suites,
    edits: [['            <WaitlistNotifications />', '']],
    testMappings: [tm('JOIN-WAITLIST-09-C-FE-MOUNT')] },
  { id: 'Y1', name: 'read notices are still shown (the unread filter is dropped)', file: 'src/components/notifications/WaitlistNotifications.tsx', suites,
    edits: [['const unread = notifications.filter((n) => !n.read);', 'const unread = notifications;']],
    testMappings: [tm('JOIN-WAITLIST-09-C-FE-STATE-READ')] },
  { id: 'Y2', name: 'Mark As Read does nothing', file: 'src/components/notifications/WaitlistNotifications.tsx', suites,
    edits: [['onClick={() => void markRead(n.id)}', 'onClick={() => undefined}']],
    testMappings: [tm('JOIN-WAITLIST-09-C-FE-STATE-MARK')] },
  { id: 'Y5', name: 'a failed load is not announced (advisory)', file: 'src/components/notifications/WaitlistNotifications.tsx', suites,
    edits: [['      {error && (', '      {false && (']],
    testMappings: [tm('JOIN-WAITLIST-09-C-FE-ERR-LOAD')] },
  { id: 'F14', name: 'the Removed badge reads Closed', file: BADGE, suites,
    edits: [['  removed: "Removed",', '  removed: "Closed",']],
    testMappings: [tm('JOIN-WAITLIST-11-A-FE')] },
  { id: 'F19', name: 'the MSG-WL-01 banner copy is changed', file: 'src/features/events/lib/registration.ts', suites,
    edits: [
    ['    `You have joined the waiting list for ${eventName}. Your position is ${position}.`,', '    `You have joined the waiting list for ${eventName}. Position ${position}.`,']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/lib/waitlist.test.ts', title: 'JOIN-WAITLIST-04-A-TEXT' }] },
  { id: 'F20', name: 'the MSG-WL-02 full-event sentence is changed', file: 'src/features/events/lib/registration.ts', suites,
    edits: [
    ['  full: "This event is full. Join the waiting list to be notified if a spot opens.",', '  full: "This event is full.",']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/lib/waitlist.test.ts', title: 'JOIN-WAITLIST-02-A-TEXT' }] },
  { id: 'F21', name: 'the waiting indicator copy is changed', file: 'src/features/events/lib/registration.ts', suites,
    edits: [
    ['  onList: "You are on the waiting list",', '  onList: "You are waiting",']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/lib/waitlist.test.ts', title: 'JOIN-WAITLIST-03-A-TEXT' }] },
  { id: 'F22', name: 'the withdrawal prompt copy for a waiting entry is changed', file: 'src/features/events/lib/registration.ts', suites,
    edits: [
    ['    `You will lose your place on the waiting list for ${eventName}. You can join again while registration is open.`,', '    `You will lose your place for ${eventName}.`,']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/lib/waitlist.test.ts', title: 'JOIN-WAITLIST-10-A-TEXT' }] },
  { id: 'F23', name: 'the Join Waiting List control is always disabled', file: 'src/features/events/pages/detail/registration/WaitlistPanel.tsx', suites,
    edits: [
    ['<Button variant="secondary" disabled={pending} aria-busy={pending} onClick={onJoin}>', '<Button variant="secondary" disabled aria-busy={pending} onClick={onJoin}>']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-01-A-FE: the Join Waiting List control is enabled' }] },
  { id: 'F24', name: 'a refused join is not announced in an alert', file: 'src/features/events/pages/detail/registration/WaitlistPanel.tsx', suites,
    edits: [
    ['        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">', '        <p className="text-sm text-danger-700 dark:text-danger-300">']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/WaitlistPanel.test.tsx', title: 'JOIN-WAITLIST-01-C-FE-ERR-ALERT' }] },
  { id: 'F25', name: 'the waiting indicator is never shown', file: 'src/features/events/pages/detail/registration/WaitlistPanel.tsx', suites,
    edits: [
    ['      {indicator && <p', '      {false && <p']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/WaitlistPanel.test.tsx', title: 'JOIN-WAITLIST-01-E-FE-STATE: a waiting attendee sees the indicator' }] },
  { id: 'F26', name: 'a refused join shows no server sentence (the alert is empty)', file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['setJoinError(error instanceof Error ? error.message : "We couldn\'t join the waiting list. Please try again.");', 'setJoinError("");']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-01-C-FE-ERR-REFUSED' }] },
  { id: 'F27', name: 'a failed join with no message gets no fallback sentence', file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['error.message : "We couldn\'t join the waiting list. Please try again.");', 'error.message : "");']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-01-C-FE-ERR-GENERIC' }] },
  { id: 'F28', name: 'a removed entry no longer shows the Closed on row', file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['    // SPM-138 AC11: a waiting entry removed when registration closed. No position, no controls.\n    heading = "Registration closed";\n    if (closesAt && hasClosed) meta = [{ label: "Closed on", value: formatSgtDateTime(closesAt) }];', '    // SPM-138 AC11: a waiting entry removed when registration closed. No position, no controls.\n    heading = "Registration closed";']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-11-A-FE-STATE-CLOSEDON' }] },
  { id: 'F29', name: "the owner's waiting position is not shown in the details", file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['          {waitlisted && current?.waitlistPosition != null && (', '          {false && (']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-05-A-FE-STATE: ATT-05 at position 2' }, { suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-06-D-FE-STATE: ATT-06 is 1' }] },
  { id: 'F30', name: 'the waiting position is shown for any status that carries one', file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['          {waitlisted && current?.waitlistPosition != null && (', '          {current?.waitlistPosition != null && (']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-05-B-FE-STATE: a confirmed or withdrawn registration' }] },
  { id: 'F31', name: 'the Withdraw control is shown after the event has started', file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['              {(registered || waitlisted) && (\n                <section aria-label="Withdrawal" className="space-y-1">\n                  {eventOccurred ? (', '              {(registered || waitlisted) && (\n                <section aria-label="Withdrawal" className="space-y-1">\n                  {false ? (']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-10-C-FE-BND-C' }] },
  { id: 'F32', name: 'Cancel in the withdrawal prompt also sends the withdrawal', file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['              onCancel={closeDialog}', '              onCancel={() => {\n                closeDialog();\n                void confirmWithdrawal();\n              }}']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-10-B-FE-STATE: Cancel closes the prompt' }] },
  { id: 'F33', name: 'a closed window does not take precedence over a free place', file: 'src/features/events/lib/registration.ts', suites,
    edits: [
    ['  if (window === "closed") return "closed";\n', '']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-11-D-FE-INT: with registration closed' }] },
  { id: 'F34', name: 'a not-yet-open window does not take precedence over a full event', file: 'src/features/events/lib/registration.ts', suites,
    edits: [
    ['  if (window === "not-yet-open") return "not-yet-open";\n', '']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-01-D-FE-INT-B' }] },
  { id: 'F35', name: 'a refused store join is swallowed (the caller sees a success)', file: 'src/store/useAppStore.ts', suites,
    edits: [
    ['      body: JSON.stringify({}),\n    });', '      body: JSON.stringify({}),\n    }).catch(() => ({ registrationId: "", status: "waitlisted", position: 0, message: "" }));']],
    testMappings: [{ suite: 'spm138', file: 'src/store/useAppStore.waitlist.test.ts', title: 'JOIN-WAITLIST-01-C-STORE-ERR' }] },
  { id: 'F36', name: 'the attendee notice is enabled for every role', file: 'src/components/notifications/WaitlistNotifications.tsx', suites,
    edits: [
    ['    enabled: user.role === "attendee",', '    enabled: true,']],
    testMappings: [{ suite: 'spm138', file: 'src/components/notifications/WaitlistNotifications.test.tsx', title: 'JOIN-WAITLIST-09-C-FE-ERR-ROLE' }] },
  { id: 'F37', name: 'cancelled-entry notices are dropped from the attendee notice', file: 'src/components/notifications/WaitlistNotifications.tsx', suites,
    edits: [
    ['const WAITING_LIST_TYPES: Notification["type"][] = ["WaitlistPromoted", "EventCancelled"];', 'const WAITING_LIST_TYPES: Notification["type"][] = ["WaitlistPromoted"];']],
    testMappings: [{ suite: 'spm138', file: 'src/components/notifications/WaitlistNotifications.test.tsx', title: 'JOIN-WAITLIST-09-C-FE-CANCEL' }] },
  { id: 'F38', name: 'the SGT formatter reads UTC instead of Asia/Singapore', file: 'src/utils/sgtDate.ts', suites,
    edits: [['  timeZone: SGT_TIME_ZONE,\n  day: "numeric",', '  timeZone: "UTC",\n  day: "numeric",']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/lib/registration.test.ts', title: 'SGT-MIDNIGHT-BND-1: a close at 23:59 SGT reads as that day' }] },
  { id: 'F39', name: 'the calendar-day count is taken in UTC', file: 'src/utils/sgtDate.ts', suites,
    edits: [['const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: SGT_TIME_ZONE });', 'const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" });']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/lib/registration.test.ts', title: 'SGT-MIDNIGHT-BND-1: 23:59 to 00:01 SGT is one calendar day' }] },
];
