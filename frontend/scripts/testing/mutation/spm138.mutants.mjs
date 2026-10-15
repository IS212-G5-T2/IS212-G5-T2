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
  'JOIN-WAITLIST-09-C-FE-READ': 'src/components/layout/AppShell.waitlist.test.tsx',
  'JOIN-WAITLIST-09-C-FE-MARK': 'src/components/layout/AppShell.waitlist.test.tsx',
  'JOIN-WAITLIST-09-C-FE-LOAD': 'src/components/layout/AppShell.waitlist.test.tsx',
  'JOIN-WAITLIST-09-C-FE': 'src/components/notifications/WaitlistNotifications.test.tsx',
  'JOIN-WAITLIST-07-E-FE': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx',
  'JOIN-WAITLIST-03-A-FE-LIST': 'src/features/events/pages/list/EventListPage.test.tsx',
  'JOIN-WAITLIST-11-C-FE': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx','JOIN-WAITLIST-02-B-UNIT': 'src/features/events/lib/waitlist.test.ts', 'JOIN-WAITLIST-01-E-FE-PENDING': 'src/features/events/pages/detail/registration/WaitlistPanel.test.tsx', 'JOIN-WAITLIST-04-A-FE': 'src/features/events/pages/detail/registration/WaitlistPanel.test.tsx', 'JOIN-WAITLIST-01-E-FE-SAMETICK': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', 'JOIN-WAITLIST-01-E-FE-REFRESH': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', 'JOIN-WAITLIST-02-A-FE': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', 'JOIN-WAITLIST-11-A-FE': 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', 'JOIN-WAITLIST-01-F-STORE': 'src/store/useAppStore.waitlist.test.ts', 'JOIN-WAITLIST-01-A-STORE': 'src/store/useAppStore.waitlist.test.ts', 'JOIN-WAITLIST-03-A-FE-DASH': 'src/features/events/pages/list/EventCard.waitlist.test.tsx', 'JOIN-WAITLIST-03-A-FE-VARIANT': 'src/features/events/pages/list/EventCard.waitlist.test.tsx', 'gives attendees personal filters and a Registered badge': 'src/features/events/pages/list/EventListPage.test.tsx'};
const tm = (title) => ({ suite: 'spm138', file: FILES[title], title });

export const MUTANTS = [
  { id: 'F1', name: 'an open, full event answers register instead of full-join', file: RULES, suites,
    edits: [['  return full ? "full-join" : "register";', '  return full ? "register" : "full-join";']],
    testMappings: [tm('JOIN-WAITLIST-02-B-UNIT')] },
  { id: 'F2', name: 'a waiting entry on a closed window is shown as closed (precedence swapped)', file: RULES, suites,
    edits: [['  if (myStatus === "waitlisted") return "waitlisted";', '  if (myStatus === "waitlisted" && window !== "closed") return "waitlisted";']],
    testMappings: [tm('JOIN-WAITLIST-02-B-UNIT')] },
  { id: 'F3', name: 'the Join control is not disabled while the request is pending', file: PANEL, suites,
    edits: [['<Button variant="secondary" disabled={pending} aria-busy={pending} onClick={onJoin}>', '<Button variant="secondary" onClick={onJoin}>']],
    testMappings: [tm('JOIN-WAITLIST-01-E-FE-PENDING')] },
  { id: 'F4', name: 'the banner is shown even without a joined position', file: PANEL, suites,
    edits: [['      {joinedPosition !== null && (', '      {true && (']],
    testMappings: [tm('JOIN-WAITLIST-04-A-FE')] },
  { id: 'F5', name: 'Dismiss does not dismiss the banner', file: PANEL, suites,
    edits: [['<Button variant="ghost" size="sm" onClick={onDismissBanner}>', '<Button variant="ghost" size="sm" onClick={() => undefined}>']],
    testMappings: [tm('JOIN-WAITLIST-04-A-FE')] },
  { id: 'F6', name: 'the in-flight guard is removed (a same-batch double click sends two requests)', file: SECTION, suites,
    edits: [['    if (joinInFlight.current) return;\n', '']],
    testMappings: [tm('JOIN-WAITLIST-01-E-FE-SAMETICK')] },
  { id: 'F7', name: 'a 409 or closed refusal does not read the attendee\'s entry again', file: SECTION, suites,
    edits: [['      if (code === "already_on_waitlist" || code === "already_registered" || code === "registration_closed" || code === "registration_not_open") {',
             '      if (false as boolean) {']],
    testMappings: [tm('JOIN-WAITLIST-01-E-FE-REFRESH')] },
  { id: 'F8', name: 'the availability line reports the spots left as the limit', file: SECTION, suites,
    edits: [['value: `${Math.max(spots, 0)} of ${limit} available`', 'value: `${Math.max(spots, 0)} of ${Math.max(spots, 0)} available`']],
    testMappings: [tm('JOIN-WAITLIST-02-A-FE')] },
  { id: 'F9', name: 'the store join accepts a non-attendee (role guard removed)', file: STORE, suites,
    edits: [['    if (!get().isAuthenticated || user.role !== "attendee") {\n      throw new Error("Only signed-in attendees can join the waiting list.");',
             '    if (false as boolean) {\n      throw new Error("Only signed-in attendees can join the waiting list.");']],
    testMappings: [tm('JOIN-WAITLIST-01-F-STORE')] },
  { id: 'F10', name: 'the store join sends no JSON body', file: STORE, suites,
    edits: [['      body: JSON.stringify({}),\n    });\n    await get().loadMyRegistration(eventId);', '    });\n    await get().loadMyRegistration(eventId);']],
    testMappings: [tm('JOIN-WAITLIST-01-A-STORE')] },
  { id: 'F11', name: 'the store join does not refresh the attendee\'s own entry', file: STORE, suites,
    edits: [['    await get().loadMyRegistration(eventId);\n    return result;', '    return result;']],
    testMappings: [tm('JOIN-WAITLIST-01-A-STORE')] },
  { id: 'F12', name: 'the Waitlisted badge reads Confirmed', file: BADGE, suites,
    edits: [['  waitlisted: "Waitlisted",', '  waitlisted: "Confirmed",']],
    testMappings: [tm('JOIN-WAITLIST-03-A-FE-DASH'), tm('JOIN-WAITLIST-03-A-FE-VARIANT')] },
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
    testMappings: [tm('JOIN-WAITLIST-09-C-FE-READ')] },
  { id: 'Y2', name: 'Mark As Read does nothing', file: 'src/components/notifications/WaitlistNotifications.tsx', suites,
    edits: [['onClick={() => void markRead(n.id)}', 'onClick={() => undefined}']],
    testMappings: [tm('JOIN-WAITLIST-09-C-FE-MARK')] },
  { id: 'Y5', name: 'a failed load is not announced (advisory)', file: 'src/components/notifications/WaitlistNotifications.tsx', suites,
    edits: [['      {error && (', '      {false && (']],
    testMappings: [tm('JOIN-WAITLIST-09-C-FE-LOAD')] },
  { id: 'F14', name: 'the Removed badge reads Closed', file: BADGE, suites,
    edits: [['  removed: "Removed",', '  removed: "Closed",']],
    testMappings: [tm('JOIN-WAITLIST-11-A-FE')] },
];
