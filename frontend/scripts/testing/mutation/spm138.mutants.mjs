// SPM-138 frontend mutants, run by the frontend runner:  node scripts/testing/mutation/run.mjs --mutants spm138.mutants.mjs
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Every mutant names the waitlist test that must go red (testMappings). Titles are matched by --testNamePattern.
export const SUITES = {
  // The SPM-138 specs and the dashboard list test that asserts the registration badge.
  spm138: {
    args: [
      'run',
      'src/features/events/lib/waitlist.test.ts',
      'src/features/events/pages/detail/registration/WaitlistPanel.test.tsx',
      'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx',
      'src/features/events/pages/detail/registration/RegistrationSection.test.tsx',
      'src/features/events/pages/list/EventCard.waitlist.test.tsx',
      'src/store/useAppStore.waitlist.test.ts',
      'src/features/events/pages/list/EventListPage.test.tsx',
      'src/features/events/lib/registration.test.ts',
      'src/features/events/pages/detail/AttendeeEventView.test.tsx',
      'src/features/registrations/pages/report/RegistrationReportStatus.test.tsx',
      'src/features/registrations/components/report/RegistrationsModal.test.tsx',
      'src/features/registrations/components/report/ReportHeader.test.tsx',
      'src/features/registrations/lib/registrationReport.status.test.ts',
      'src/features/events/pages/list/EventCard.attendee.test.tsx',
      'src/features/events/pages/detail/registration/RegistrationStatusCard.test.tsx',
      'src/features/events/pages/detail/registration/ConfirmDialog.test.tsx',
      'src/features/events/pages/detail/registration/WithdrawalConfirmation.test.tsx',
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

export const MUTANTS = [  { id: 'F1', name: 'an open, full event answers register instead of full-join', file: RULES, suites,
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
    edits: [['    if (!get().isAuthenticated || user.role !== "attendee") {\n      throw new Error("Only signed-in attendees can join the waitlist.");',
             '    if (false as boolean) {\n      throw new Error("Only signed-in attendees can join the waitlist.");']],
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
  // retired: SPM-139 changed the attendee badge, so the SPM-138 expectation no longer applies.
  // { id: 'F13', name: 'the registered badge reads Registered (the D3 relabel is reverted)', file: BADGE, suites,
  // edits: [['  registered: "Confirmed",', '  registered: "Registered",']],
  // testMappings: [tm('gives attendees personal filters and a Registered badge')] },
  { id: 'F15', name: 'the dashboard stops passing the waiting status to the card', file: LIST, suites,
    edits: [['registrationStatus={isAttendee ? cardRegistrationStatus(e.myRegistrationStatus) : undefined}', 'registrationStatus={undefined}']],
    testMappings: [tm('JOIN-WAITLIST-03-A-FE-LIST')] },
  { id: 'F16', name: 'the registration-disabled guard is dropped (the normal state logic runs for a disabled event)', file: SECTION, suites,
    edits: [['  if (!event.registrationEnabled && !registered && !waitlisted) {', '  if (false as boolean) {']],
    testMappings: [tm('JOIN-WAITLIST-11-C-FE')] },
  { id: 'F17', name: 'the withdrawn suppression on the waitlist panel is restored (no rejoin from a withdrawn card)', file: SECTION, suites,
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
    ['    `You have joined the waitlist for ${eventName}. Your position is ${position}.`,', '    `You have joined the waitlist for ${eventName}. Position ${position}.`,']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/lib/waitlist.test.ts', title: 'JOIN-WAITLIST-04-A-TEXT' }] },
  { id: 'F20', name: 'the MSG-WL-02 full-event sentence is changed', file: 'src/features/events/lib/registration.ts', suites,
    edits: [
    ['  full: "This event is full. Join the waitlist to be notified if a spot opens.",', '  full: "This event is full.",']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/lib/waitlist.test.ts', title: 'JOIN-WAITLIST-02-A-TEXT' }] },
  { id: 'F23', name: 'the Join Waitlist control is always disabled', file: 'src/features/events/pages/detail/registration/WaitlistPanel.tsx', suites,
    edits: [
    ['<Button variant="secondary" disabled={pending} aria-busy={pending} onClick={onJoin}>', '<Button variant="secondary" disabled aria-busy={pending} onClick={onJoin}>']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-01-A-FE: the Join Waitlist control is enabled' }] },
  { id: 'F24', name: 'a refused join is not announced in an alert', file: 'src/features/events/pages/detail/registration/WaitlistPanel.tsx', suites,
    edits: [
    ['        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">', '        <p className="text-sm text-danger-700 dark:text-danger-300">']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/WaitlistPanel.test.tsx', title: 'JOIN-WAITLIST-01-C-FE-ERR-ALERT' }] },
  { id: 'F26', name: 'a refused join shows no server sentence (the alert is empty)', file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['setJoinError(error instanceof Error ? error.message : "We couldn\'t join the waitlist. Please try again.");', 'setJoinError("");']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-01-C-FE-ERR-REFUSED' }] },
  { id: 'F27', name: 'a failed join with no message gets no fallback sentence', file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['error.message : "We couldn\'t join the waitlist. Please try again.");', 'error.message : "");']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-01-C-FE-ERR-GENERIC' }] },
  { id: 'F28', name: 'a removed entry no longer shows the Closed on row', file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['    // SPM-138 AC11: a waiting entry removed when registration closed. No position, no controls.\n    heading = "Registration has closed";\n    if (closesAt && hasClosed) meta = [{ label: "Closed on", value: formatSgtDateTime(closesAt) }];', '    // SPM-138 AC11: a waiting entry removed when registration closed. No position, no controls.\n    heading = "Registration has closed";']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-11-A-FE-STATE-CLOSEDON' }] },
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
  // retired: SPM-139 changed the attendee card badge, so the SPM-138 expectation no longer applies.
  // { id: 'BADGE-M1', name: 'the attendee card always shows the event status badge', file: 'src/features/events/pages/list/EventCard.tsx', suites,
  // edits: [
  // ['const showEventBadge = !(attendeeView && event.status === "approved");', 'const showEventBadge = true;']],
  // testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/list/EventCard.attendee.test.tsx', title: 'CARD-BADGE-01-A-STATE' }, { suite: 'spm138', file: 'src/features/events/pages/list/EventCard.attendee.test.tsx', title: 'CARD-BADGE-02-A-STATE' }] },
  { id: 'BADGE-M2', name: 'the attendee card hides every event status badge, Completed and Cancelled too', file: 'src/features/events/pages/list/EventCard.tsx', suites,
    edits: [
    ['const showEventBadge = !(attendeeView && event.status === "approved");', 'const showEventBadge = !attendeeView;']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/list/EventCard.attendee.test.tsx', title: 'CARD-BADGE-06-A-STATE' }, { suite: 'spm138', file: 'src/features/events/pages/list/EventCard.attendee.test.tsx', title: 'CARD-BADGE-07-A-STATE' }] },
  { id: 'BADGE-M3', name: 'the event status Approved is hidden for every viewer, not only attendees', file: 'src/features/events/pages/list/EventCard.tsx', suites,
    edits: [
    ['const showEventBadge = !(attendeeView && event.status === "approved");', 'const showEventBadge = !(event.status === "approved");']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/list/EventCard.attendee.test.tsx', title: 'CARD-BADGE-08-B-STATE' }] },
  { id: 'BADGE-M4', name: 'the card drops its registration badge', file: 'src/features/events/pages/list/EventCard.tsx', suites,
    edits: [
    ['{registrationChip && <Chip label={registrationChip.label} className={registrationChip.className} />}', '{false}']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/list/EventCard.attendee.test.tsx', title: 'CARD-BADGE-03-A-STATE' }, { suite: 'spm138', file: 'src/features/events/pages/list/EventCard.attendee.test.tsx', title: 'CARD-BADGE-02-A-STATE' }] },
  { id: 'LIST-M5', name: 'the list drops a withdrawn registration status (no Withdrawn badge)', file: 'src/features/events/pages/list/EventListPage.tsx', suites,
    edits: [
    ['  return status === "registered" || status === "waitlisted" || status === "withdrawn" ? status : undefined;', '  return status === "registered" || status === "waitlisted" ? status : undefined;']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/list/EventListPage.test.tsx', title: 'CARD-BADGE-05-A-STATE' }] },
  { id: 'CARD-M5', name: "the confirmed card headline reads Registered, not You're registered", file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.tsx', suites,
    edits: [
    ['const headline = waitlisted ? "You\'re on the waitlist" : "You\'re registered";', 'const headline = waitlisted ? "You\'re on the waitlist" : "Registered";']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.test.tsx', title: 'CARD-01-A-STATE' }] },
  { id: 'CARD-M6', name: 'the waitlisted card shows Registered on in place of the join time', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.tsx', suites,
    edits: [
    ['      ? { label: "Joined waitlist on", value: registration.joinedAt ? formatSgtDateTime(registration.joinedAt) : NOT_PROVIDED }', '      ? { label: "Registered on", value: registration.joinedAt ? formatSgtDateTime(registration.joinedAt) : NOT_PROVIDED }']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.test.tsx', title: 'CARD-02-A-STATE' }] },
  { id: 'CARD-M7', name: 'the position notice shows with no position', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.tsx', suites,
    edits: [
    ['      {waitlisted && position != null && (', '      {waitlisted && (']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.test.tsx', title: 'CARD-03-A-BND' }] },
  { id: 'CARD-M8', name: 'the waitlisted action reads Withdraw', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.tsx', suites,
    edits: [
    ['            {waitlisted ? "Leave waitlist" : "Withdraw"}', '            {"Withdraw"}']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.test.tsx', title: 'CARD-02-A-STATE' }] },
  { id: 'CARD-M9', name: 'a missing join time is shown as the registration time, not as not-provided', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.tsx', suites,
    edits: [
    ['      ? { label: "Joined waitlist on", value: registration.joinedAt ? formatSgtDateTime(registration.joinedAt) : NOT_PROVIDED }', '      ? { label: "Joined waitlist on", value: formatSgtDateTime(registration.joinedAt ?? registration.registeredAt) }']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.test.tsx', title: 'CARD-02-B-ASSUMED' }] },
  { id: 'CARD-M10', name: 'the card action does not call its handler', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.tsx', suites,
    edits: [
    ['            onClick={onAction}', '            onClick={() => undefined}']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.test.tsx', title: 'CARD-03-B-INT' }] },
  { id: 'CARD-M11', name: 'the card action is shown after the event has started', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.tsx', suites,
    edits: [
    ['        {actionHidden ? (', '        {false ? (']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.test.tsx', title: 'CARD-03-C-STATE' }] },
  { id: 'CDLG-M1', name: 'the leave warning box (the place and the unrestorable note) is not shown', file: 'src/features/events/pages/detail/registration/ConfirmDialog.tsx', suites,
    edits: [
    ['        {variant === "leave-waitlist" && (', '        {false && (']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/ConfirmDialog.test.tsx', title: 'CDLG-01-A-STATE' }] },
  { id: 'CDLG-M2', name: 'the leave body omits that the registration is withdrawn too', file: 'src/features/events/pages/detail/registration/ConfirmDialog.tsx', suites,
    edits: [
    ['    body: "Leaving the waitlist also withdraws your registration for this event. You\'ll lose your place in line.",', '    body: "Leaving the waitlist removes your place in line.",']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/ConfirmDialog.test.tsx', title: 'CDLG-01-A-STATE' }] },
  { id: 'CDLG-M3', name: 'the danger button shows no loading state while the request runs', file: 'src/features/events/pages/detail/registration/ConfirmDialog.tsx', suites,
    edits: [
    ['            {pending && <Spinner />}', '            {false}']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/ConfirmDialog.test.tsx', title: 'CDLG-02-A-STATE' }] },
  { id: 'CDLG-M4', name: 'the danger button stays enabled while the request runs', file: 'src/features/events/pages/detail/registration/ConfirmDialog.tsx', suites,
    edits: [
    ['          <Button variant="danger" disabled={pending} aria-busy={pending} onClick={onConfirm}>', '          <Button variant="danger" aria-busy={pending} onClick={onConfirm}>']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/ConfirmDialog.test.tsx', title: 'CDLG-02-A-STATE' }] },
  { id: 'CDLG-M5', name: 'an error is not shown inside the dialog', file: 'src/features/events/pages/detail/registration/ConfirmDialog.tsx', suites,
    edits: [
    ['        {error && (', '        {false && (']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/ConfirmDialog.test.tsx', title: 'CDLG-03-A-ERR' }] },
  { id: 'CDLG-M12', name: 'initial focus goes to the danger action, not the safe option', file: 'src/features/events/pages/detail/registration/ConfirmDialog.tsx', suites,
    edits: [
    ['    safeRef.current?.focus();', '    (panelRef.current?.querySelector("button:last-of-type") as HTMLElement | null)?.focus();']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/ConfirmDialog.test.tsx', title: 'CDLG-01-B-STATE' }] },
  { id: 'TOAST-M1', name: 'the toast never times out', file: 'src/components/ui/Toast.tsx', suites,
    edits: [
    ['    const timer = window.setTimeout(onDismiss, durationMs);', '    const timer = window.setTimeout(() => undefined, durationMs);']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/WithdrawalConfirmation.test.tsx', title: 'WITHDRAW-EVENT-REG-06-A (A): pending state, then a status toast that times out' }] },
  { id: 'LEAVE-M', name: 'the leave success toast copy is wrong', file: 'src/features/events/pages/detail/registration/RegistrationSection.tsx', suites,
    edits: [
    ['      setToast(variant === "leave-waitlist" ? "Left the waitlist" : "Registration withdrawn");', '      setToast(variant === "leave-waitlist" ? "Left the list" : "Registration withdrawn");']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-10-A-FE: the leave prompt says' }] },
  { id: 'CARD-COPY', name: 'the position notice copy is changed', file: 'src/features/events/lib/registration.ts', suites,
    edits: [
    ["  inLine: (position: number) => `You're #${position} in line`,", "  inLine: (position: number) => `You're ${position} in line`,"]],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/lib/waitlist.test.ts', title: 'JOIN-WAITLIST-03-A-TEXT: the position notice' }, { suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-05-A-FE-STATE' }] },
  { id: 'CARD-M12', name: "the waitlisted card headline reads something other than You're on the waitlist", file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.tsx', suites,
    edits: [
    ['const headline = waitlisted ? "You\'re on the waitlist" : "You\'re registered";', 'const headline = waitlisted ? "On the waitlist" : "You\'re registered";']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-01-E-FE-STATE' }, { suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-03-A-FE-STATE' }] },
  { id: 'CARD-M13', name: 'the position notice shows on a confirmed card too', file: 'src/features/events/pages/detail/registration/RegistrationStatusCard.tsx', suites,
    edits: [
    ['      {waitlisted && position != null && (', '      {position != null && (']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx', title: 'JOIN-WAITLIST-05-B-FE-STATE' }] },
  { id: 'PANEL-M', name: 'the panel shows a Join control even with no join handler', file: 'src/features/events/pages/detail/registration/WaitlistPanel.tsx', suites,
    edits: [
    ['      {onJoin && (', '      {true && (']],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/WaitlistPanel.test.tsx', title: 'JOIN-WAITLIST-01-E-FE-STATE' }] },
  { id: 'F-REP-FILTER-OPTIONS', name: 'the status filter omits Withdrawn', file: 'src/features/registrations/lib/registrationReport.ts', suites,
    edits: [
    ['export const REPORT_STATUS_FILTERS: { value: ReportStatusFilter; label: string }[] = [\n  { value: "all", label: "All" },\n  ...REPORT_STATUS_VALUES.map((value) => ({ value, label: REPORT_STATUS_LABELS[value] })),\n];', 'export const REPORT_STATUS_FILTERS: { value: ReportStatusFilter; label: string }[] = [\n  { value: "all", label: "All" },\n  ...REPORT_STATUS_VALUES.filter((value) => value !== "withdrawn").map((value) => ({ value, label: REPORT_STATUS_LABELS[value] })),\n];']],
    testMappings: [{ suite: 'spm138', file: 'src/features/registrations/pages/report/RegistrationReportStatus.test.tsx', title: 'REP-FE-01-A: the filter lists All and the five statuses' }] },
  { id: 'F-REP-BADGE', name: 'the table shows the raw status instead of its badge', file: 'src/features/registrations/components/report/ReportTable.tsx', suites,
    edits: [
    ['                  <StatusBadge status={row.status} />', '                  {row.status}']],
    testMappings: [{ suite: 'spm138', file: 'src/features/registrations/pages/report/RegistrationReportStatus.test.tsx', title: 'REP-FE-01-B: each row carries its status badge' }] },
  { id: 'F-REP-HEADER', name: 'the header omits the waitlist count', file: 'src/features/registrations/components/report/ReportHeader.tsx', suites,
    edits: [
    ['      <p className="text-sm text-gray-700 dark:text-gray-300">{waitlistCountLine(waitlistCount)}</p>', '      <p className="text-sm text-gray-700 dark:text-gray-300"></p>']],
    testMappings: [{ suite: 'spm138', file: 'src/features/registrations/pages/report/RegistrationReportStatus.test.tsx', title: 'REP-FE-01-B: each row carries its status badge' }] },
  { id: 'F-REP-FILTER-IGNORED', name: 'the report request ignores the chosen status', file: 'src/features/registrations/lib/registrationReport.ts', suites,
    edits: [
    ['  const query = reportStatusQuery(filter);\n  return api<RegistrationReport>', '  const query = "";\n  return api<RegistrationReport>']],
    testMappings: [{ suite: 'spm138', file: 'src/features/registrations/pages/report/RegistrationReportStatus.test.tsx', title: 'REP-FE-02-A: choosing Waitlisted asks for waitlisted rows' }] },
  { id: 'F-REP-EXPORT-IGNORES-FILTER', name: 'the export ignores the chosen status', file: 'src/features/registrations/lib/registrationReport.ts', suites,
    edits: [
    ['  const status = reportStatusQuery(filter);\n  let response: Response;', '  const status = "";\n  let response: Response;']],
    testMappings: [{ suite: 'spm138', file: 'src/features/registrations/lib/registrationReport.status.test.ts', title: 'REP-FE-03-C: the CSV request names the chosen status' }] },
];

// ---- Kills-claim mutants for the period boundary tests (registration.test.ts, SPM-138 round). One test each.
const RS = 'src/features/events/lib/registration.ts';
const RT = 'src/features/events/lib/registration.test.ts';
const PERIOD_OPEN = '  if (period.opensAt && current < new Date(period.opensAt).getTime()) return false;';
const PERIOD_CLOSE = '  if (period.closesAt && current >= new Date(period.closesAt).getTime()) return false;';
const boundary = (id, name, edits, title) => ({ id, name, file: RS, suites, edits, testMappings: [{ suite: 'spm138', file: RT, title }] });
MUTANTS.push(
  boundary('K-PERIOD-A', 'an opening that is not enforced (registration open before the opening instant)',
    [[PERIOD_OPEN, '  if (period.opensAt && false) return false;']], '[A] one second before the opening instant, registration is not open'),
  boundary('K-PERIOD-B', 'the opening instant is exclusive (exactly at the opening, registration reads closed)',
    [[PERIOD_OPEN, PERIOD_OPEN.replace('current < new', 'current <= new')]], '[B] exactly at the opening instant, registration is open'),
  boundary('K-PERIOD-C', 'the close is one minute early (registration closes a minute before the closing instant)',
    [[PERIOD_CLOSE, PERIOD_CLOSE.replace('.getTime()) return false;', '.getTime() - 60_000) return false;')]], '[C] one minute before the closing instant, registration is still accepted'),
  boundary('K-PERIOD-D', 'the closing instant is inclusive-open (exactly at the closing, registration reads open)',
    [[PERIOD_CLOSE, PERIOD_CLOSE.replace('current >= new', 'current > new')]], '[D] exactly at the closing instant, registration is closed'),
  boundary('K-PERIOD-BND', 'a missing opening bound is treated as closed',
    [[PERIOD_OPEN, PERIOD_OPEN.replace('period.opensAt && current', '!period.opensAt || current')]], 'treats a missing bound as unbounded'),
);

// ---- Round-11 frontend mutants: header totals under a filter (TCR11-3) and the modal filter and position (TCR11-4).
const PAGE = 'src/features/registrations/pages/report/RegistrationReportPage.tsx';
const MODAL = 'src/features/registrations/components/report/RegistrationsModal.tsx';
const RSTATUS = 'src/features/registrations/pages/report/RegistrationReportStatus.test.tsx';
const MODAL_TEST = 'src/features/registrations/components/report/RegistrationsModal.test.tsx';
MUTANTS.push(
  { id: 'PF-HEADER-ROWS', name: 'the page header counts the filtered rows instead of the event total', file: PAGE, suites,
    edits: [['        totalConfirmed={report.totalConfirmed}', '        totalConfirmed={report.registrations.length}']],
    testMappings: [{ suite: 'spm138', file: RSTATUS, title: 'REP-FE-02-A: choosing Waitlisted asks for waitlisted rows, shows only them, and keeps the header totals' }] },
  { id: 'PF-SPOTS-ROWS', name: 'the page spots line is computed from the filtered rows', file: PAGE, suites,
    edits: [['        availableSpots={report.availableSpots}', '        availableSpots={report.event.capacity - report.registrations.length}']],
    testMappings: [{ suite: 'spm138', file: RSTATUS, title: 'REP-FE-02-A: choosing Waitlisted asks for waitlisted rows, shows only them, and keeps the header totals' }] },
  { id: 'PF-MODAL-REQ', name: 'the modal request ignores the chosen status', file: MODAL, suites,
    edits: [['useRegistrationReport(eventId, statusFilter);', 'useRegistrationReport(eventId);']],
    testMappings: [{ suite: 'spm138', file: MODAL_TEST, title: 'REP-MOD-01-A: choosing Waitlisted asks for ?status=waitlisted and shows the waitlisted entry' }] },
  { id: 'PF-MODAL-EXPORT', name: 'the modal export drops the chosen status', file: MODAL, suites,
    edits: [['useReportExport(eventId, statusFilter);', 'useReportExport(eventId);']],
    testMappings: [{ suite: 'spm138', file: MODAL_TEST, title: 'REP-MOD-02-A: the CSV export is requested with the status on screen' }] },
  { id: 'PF-MODAL-POS', name: 'an expanded waitlisted card omits its position', file: MODAL, suites,
    edits: [['{row.status === "waitlisted" && row.waitlistPosition !== undefined ? ` (position ${row.waitlistPosition})` : ""}', '{""}']],
    testMappings: [{ suite: 'spm138', file: MODAL_TEST, title: 'REP-MOD-03-A: an expanded waitlisted card reads Waitlisted (position 1)' }] },
);

// ---- Round-11 mutants for the untagged modal tests, the empty-status state and the status query helper.
const MODAL_T = 'src/features/registrations/components/report/RegistrationsModal.test.tsx';
const TABLE_FILE = 'src/features/registrations/components/report/ReportTable.tsx';
const QUERY_FILE = 'src/features/registrations/lib/registrationReport.ts';
const QUERY_TEST = 'src/features/registrations/lib/registrationReport.status.test.ts';
const modalTitle = (title) => ({ suite: 'spm138', file: MODAL_T, title });
MUTANTS.push(
  { id: 'M-MODAL-SUMMARY-WL', name: 'the summary omits the waitlist count', file: MODAL, suites,
    edits: [['<p className="text-gray-600 dark:text-gray-400">{waitlistCount} on the waitlist</p>', '<p className="text-gray-600 dark:text-gray-400"></p>']],
    testMappings: [modalTitle('shows the count in the title and the capacity, period and waitlist summary')] },
  { id: 'M-MODAL-403', name: 'the 403 access message is not shown', file: MODAL, suites,
    edits: [['{state.status === "forbidden" && ', '{false && ']],
    testMappings: [modalTitle('shows the access-refused message and no registrations on a 403')] },
  { id: 'M-MODAL-EXPAND', name: 'a card never expands', file: MODAL, suites,
    edits: [['{expanded && (', '{false && (']],
    testMappings: [modalTitle('expands a card to show details and collapses it again')] },
  { id: 'M-MODAL-SINGLE', name: 'every card expands when any card is open', file: MODAL, suites,
    edits: [['expanded={expandedId === row.registrationId}', 'expanded={expandedId !== null}']],
    testMappings: [modalTitle('keeps a single card expanded at a time')] },
  { id: 'M-MODAL-EMPTY', name: 'the empty state shows the no-match text', file: MODAL, suites,
    edits: [['{REPORT_MESSAGES.empty}', '{NO_MATCH}']],
    testMappings: [modalTitle("shows 'No registrations yet' when there are none")] },
  { id: 'M-MODAL-EXPORT-PDF', name: 'the PDF button exports CSV', file: MODAL, suites,
    edits: [['onClick={() => void exportAs("pdf")}', 'onClick={() => void exportAs("csv")}']],
    testMappings: [modalTitle('downloads the CSV and the PDF through the server export')] },
  { id: 'M-MODAL-EXPORT-ERR', name: 'an export failure is not shown', file: MODAL, suites,
    edits: [['{exportError && (', '{false && (']],
    testMappings: [modalTitle('shows an export failure without closing the modal')] },
  { id: 'F-REP-EMPTY-STATUS', name: 'a filtered empty status shows the all-empty text', file: TABLE_FILE, suites,
    edits: [['{filter === "all" ? REPORT_MESSAGES.empty : REPORT_MESSAGES.emptyForStatus}', '{REPORT_MESSAGES.empty}']],
    testMappings: [{ suite: 'spm138', file: 'src/features/registrations/pages/report/RegistrationReportStatus.test.tsx', title: 'REP-FE-03-B: a status with no rows shows that no registrations have it' }] },
  { id: 'F-REP-QUERY-ALL', name: 'the query helper names a status for the all filter', file: QUERY_FILE, suites,
    edits: [['  return filter === "all" ? "" : `status=${encodeURIComponent(filter)}`;', '  return `status=${encodeURIComponent(filter)}`;']],
    testMappings: [{ suite: 'spm138', file: QUERY_TEST, title: 'REP-FE-03-D: the report query is empty for every status and names one status otherwise' }] },
);

// ---- Attendee event view (AttendeeEventView.tsx, SPM-62 redesign). One mutant per Kills line in AttendeeEventView.test.tsx.
const AV_TEST = 'src/features/events/pages/detail/AttendeeEventView.test.tsx';
MUTANTS.push(
  { id: "AV-TIME-FORMAT", name: "times rendered on a 24-hour clock", file: "src/features/events/lib/attendeeEventView.ts", suites,
    edits: [["  return `${hours}:${minutes}${d.getHours() < 12 ? \"am\" : \"pm\"}`;", "  return `${d.getHours()}:${minutes}`;"]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "formats times as 8:00am, 12:01am and 5:00pm, and deadlines as day, month, year, time" }] },
  { id: "AV-VENUE-ALWAYS-TBA", name: "a booked venue replaced by the placeholder", file: "src/features/events/lib/attendeeEventView.ts", suites,
    edits: [["return event.venueName?.trim() ? event.venueName : \"To be announced\";", "return \"To be announced\";"]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "shows the venue name, not the placeholder, once a venue is booked" }] },
  { id: "AV-PLACEHOLDER-DEADLINE", name: "the hard-coded placeholder deadline", file: "src/features/events/lib/attendeeEventView.ts", suites,
    edits: [[": formatDeadline(event.registrationClosesAt);", ": \"5 Nov 2026, 11:59pm\";"]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "shows the Register by item with the event's own deadline in local time" }] },
  { id: "AV-DEADLINE-WHEN-NONE", name: "Register by item shown with no deadline", file: "src/features/events/pages/detail/AttendeeEventView.tsx", suites,
    edits: [["{deadline !== null && <Fact icon=\"hourglass\" label=\"Register by\" value={deadline} warning />}", "{<Fact icon=\"hourglass\" label=\"Register by\" value={deadline ?? \"Not set\"} warning />}"]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "hides the Register by item when no deadline is set" }] },
  { id: "AV-DATE-SPAN", name: "a multi-day event shown with its first date only", file: "src/features/events/pages/detail/AttendeeEventView.tsx", suites,
    edits: [[": `${formatAttendeeDate(start)} to ${formatAttendeeDate(end)}`;", ": formatAttendeeDate(start);"]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "shows both dates when the event runs over more than one day" }] },
  // retired: SPM-139 removed the AttendeeEventView register footer, register box and coordinator sentence; the entries below are kept for the record, not run.
  // { id: "AV-BUTTON-ENABLED-AFTER-DEADLINE", name: "register button enabled after the deadline", file: "src/features/events/lib/attendeeEventView.ts", suites,
  // edits: [["if (state === \"closed\" || state === \"disabled\") {", "if (state === \"disabled\") {"]],
  // testMappings: [{ suite: 'spm138', file: AV_TEST, title: "shows Registration closed and disables the button once the deadline has passed" }] },
  // { id: "AV-REGISTER-ENABLED-WHEN-FULL", name: "a full event leaves the register button enabled", file: "src/features/events/lib/attendeeEventView.ts", suites,
  // edits: [["if (state === \"full\" || event.isFull) {", "if (false) {"]],
  // testMappings: [{ suite: 'spm138', file: AV_TEST, title: "disables the register button with a reason when the event is full" }] },
  // { id: "AV-FULL-NO-WAITLIST-BUTTON", name: "Join waitlist hidden on a full event with a waitlist", file: "src/features/events/pages/detail/AttendeeEventView.tsx", suites,
  // edits: [["{action.kind === \"disabled\" && action.waitlistAvailable && (", "{false && ("]],
  // testMappings: [{ suite: 'spm138', file: AV_TEST, title: "offers Join waitlist on a full event whose waitlist is available, and calls onJoinWaitlist" }] },
  // { id: "AV-NOT-YET-OPEN-REASON", name: "helper text omits the opening time", file: "src/features/events/lib/attendeeEventView.ts", suites,
  // edits: [["reason: `Registration opens ${formatDeadline(event.registrationOpensAt)}`,", "reason: \"Registration closed\","]],
  // testMappings: [{ suite: 'spm138', file: AV_TEST, title: "disables the button and gives the opening time as the reason before registration opens" }] },
  // { id: "AV-REGISTER-NOT-WIRED", name: "register button does nothing when clicked", file: "src/features/events/pages/detail/AttendeeEventView.tsx", suites,
  // edits: [["<Button onClick={onRegister} disabled={action.kind === \"disabled\"}>", "<Button disabled={action.kind === \"disabled\"}>"]],
  // testMappings: [{ suite: 'spm138', file: AV_TEST, title: "calls onRegister when the register button is clicked on an open event" }] },
  // { id: "AV-REGISTER-SHOWN-REGISTERED", name: "footer shown to a registered attendee", file: "src/features/events/lib/attendeeEventView.ts", suites,
  // edits: [["if (registration && HIDDEN_FOR.has(registration.status)) return { kind: \"hidden\" };", "if (registration && HIDDEN_FOR.has(registration.status) && false) return { kind: \"hidden\" };"]],
  // testMappings: [{ suite: 'spm138', file: AV_TEST, title: "hides the footer and the register button for an attendee who is already registered" }] },
  // { id: "AV-REGISTRATION-OFF-FOOTER", name: "footer leads into registration that is switched off", file: "src/features/events/lib/attendeeEventView.ts", suites,
  // edits: [["if (!event.registrationEnabled) return { kind: \"hidden\" };", "if (!event.registrationEnabled) return { kind: \"register\" };"]],
  // testMappings: [{ suite: 'spm138', file: AV_TEST, title: "shows no footer when registration through the website is not enabled" }] },
  { id: "AV-ACCESS-EMPTY-SHOWN", name: "empty Accessibility section shown", file: "src/features/events/pages/detail/AttendeeEventView.tsx", suites,
    edits: [["{features.length > 0 && (", "{true && ("]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "hides the Accessibility section when the event has no features" }] },
  { id: "AV-ACCESS-CHIPS-HIDDEN", name: "features not listed as chips", file: "src/features/events/pages/detail/AttendeeEventView.tsx", suites,
    edits: [["{features.map((feature) => (", "{features.slice(0, 0).map((feature) => ("]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "lists each accessibility feature as a chip with its own icon" }] },
  { id: "AV-INTERNAL-STATUS-LEAK", name: "internal status leaked as the badge", file: "src/features/events/pages/detail/AttendeeEventView.tsx", suites,
    edits: [["{badge === \"upcoming\" ? \"Upcoming\" : badge === \"ongoing\" ? \"Ongoing\" : \"Ended\"}", "{event.status}"]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "shows an attendee-facing lifecycle label and never the internal event status" }] },
  { id: "AV-INTERNAL-FIELDS-SHOWN", name: "room layout shown to attendees", file: "src/features/events/pages/detail/AttendeeEventView.tsx", suites,
    edits: [["<Fact icon=\"map-pin\" label=\"Venue\" value={venueText(event)} />", "<Fact icon=\"map-pin\" label=\"Venue\" value={venueText(event)} /><Fact icon=\"map-pin\" label=\"Room layout\" value={event.venueRequirements.layout} />"]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "does not show room layout, required facilities, equipment needs, expected attendance, last updated or internal status" }] },
  { id: "AV-ATTACHMENTS-HIDDEN", name: "event programme not listed", file: "src/features/events/pages/detail/AttendeeEventView.tsx", suites,
    edits: [["{attachments.length > 0 && (", "{false && ("]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "lists the event programme with View and Download when attachments exist, and calls onViewAttachment" }] },
  // { id: "AV-FOOTER-COORDINATOR", name: "coordinator sentence shown with no coordinator", file: "src/features/events/pages/detail/AttendeeEventView.tsx", suites,
  // edits: [["{event.coordinatorName ? ` Questions go to ${event.coordinatorName}.` : \"\"}", "{` Questions go to ${event.coordinatorName ?? \"nobody\"}.`}"]],
  // testMappings: [{ suite: 'spm138', file: AV_TEST, title: "omits the coordinator sentence when no coordinator is assigned" }] },
  { id: "AV-DEADLINE-MIDNIGHT", name: "deadline date shifted back two minutes (crosses midnight)", file: "src/features/events/lib/attendeeEventView.ts", suites,
    edits: [["  const d = new Date(value);\n  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${formatAttendeeTime(value)}`;", "  const d = new Date(new Date(value).getTime() - 120_000);\n  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${formatAttendeeTime(value)}`;"]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "keeps a deadline that falls just after local midnight on the new day" }] },
  { id: "AV-STATUS-BADGE-MAP", name: "badge mapping wrong", file: "src/features/events/lib/attendeeEventView.ts", suites,
    edits: [["if (label === \"Upcoming\") return \"upcoming\";", "if (label === \"Upcoming\") return \"ongoing\";"]],
    testMappings: [{ suite: 'spm138', file: AV_TEST, title: "maps the event's times to upcoming, ongoing and ended, with cancelled reading as ended" }] },
  { id: "RS-REGISTER-NOT-FOCUSED", name: "form opens but focus is not moved", file: "src/features/events/pages/detail/registration/RegistrationSection.tsx", suites,
    edits: [["    firstField?.focus();", "    void firstField;"]],
    testMappings: [{ suite: 'spm138', file: 'src/features/events/pages/detail/registration/RegistrationSection.test.tsx', title: "moves focus to the form's first field when Register is clicked" }] },
);
