// SPM-120 frontend mutants, run by run.mjs. Each edit is [from, to]; `from` must occur exactly once in the file
// (the runner reports MISAPPLIED otherwise). IDs match docs/specs/SPM-120-test-results.md, "Mutation spot-check".
// Not reproduced here: M11 (backend, needs a TZ-specific run). M8 is the frontend formatter's time zone (M8-fe).
export const SUITES = {
  // Component, page and utility suites that exercise the SPM-120 code (Vitest, jsdom, HTTP mocked at the boundary).
  spm120: { args: ['run', 'src/features/events/pages/detail/registration', 'src/features/events/pages', 'src/features/events/lib'] },
};

const D = 'src/features/events/pages/detail/registration';
const SECTION = `${D}/RegistrationSection.tsx`;
const DIALOG = `${D}/WithdrawalConfirmation.tsx`;
const STATUS = `${D}/WithdrawnRegistrationStatus.tsx`;
const VIEW = 'src/features/events/lib/EventView.ts';
const UTIL = 'src/features/events/lib/registration.ts';
const suites = ['spm120'];

export const MUTANTS = [
  { id: 'M1-fe', name: '`>=` to `>` in hasEventStarted (event start no longer exclusive)', file: UTIL, suites,
    edits: [['return now.getTime() >= new Date(event.startDateTime).getTime();', 'return now.getTime() > new Date(event.startDateTime).getTime();']] },
  { id: 'M7', name: 'success banner shown before the response arrives', file: SECTION, suites,
    edits: [['      await submitWithdrawal(current.id);\n', '      setWithdrawalMessage(WITHDRAWAL_MESSAGES.success(event.name));\n      await submitWithdrawal(current.id);\n']] },
  { id: 'M8-fe', name: 'timestamps formatted in UTC instead of Asia/Singapore', file: UTIL, suites,
    edits: [['  timeZone: SGT_TIME_ZONE,\n  day: "numeric",', '  timeZone: "UTC",\n  day: "numeric",']] },
  { id: 'M9a', name: 'Cancel sends the withdrawal request', file: DIALOG, suites,
    edits: [['<Button ref={cancelRef} variant="secondary" disabled={pending} onClick={onCancel}>', '<Button ref={cancelRef} variant="secondary" disabled={pending} onClick={onConfirm}>']] },
  { id: 'M9b', name: 'a click on the backdrop confirms the withdrawal', file: DIALOG, suites,
    edits: [['bg-gray-900/50 p-4" role="presentation">', 'bg-gray-900/50 p-4" role="presentation" onClick={onConfirm}>']] },
  { id: 'M12', name: 'dialog keyboard handling (focus trap and Escape) removed', file: DIALOG, suites,
    edits: [['document.addEventListener("keydown", onKey);', '/* listener removed */']] },
  { id: 'M13', name: 'a 401 from the withdraw call no longer signs the user out', file: 'src/store/useAppStore.ts', suites,
    edits: [['if (error instanceof ApiError && error.status === 401) {', 'if (false) {']] },
  { id: 'M14', name: 'the Registered and Withdrawn timeline timestamps swapped', file: STATUS, suites,
    edits: [['label: "Registered", iso: registration.registeredAt', 'label: "Registered", iso: registration.withdrawnAt'], ['label: "Withdrawn", iso: registration.withdrawnAt', 'label: "Withdrawn", iso: registration.registeredAt']] },
  { id: 'M15', name: 'registration looked up by id instead of event + attendee', file: SECTION, suites, equivalent: true,
    note: 'the backend reuses the same row (same id) on re-register, so both lookups behave identically',
    edits: [['s.registrations.find((r) => r.eventId === event.id && r.attendeeId === currentUser.id)', 's.registrations.find((r) => r.id === registration?.id)']] },
  { id: 'M16', name: 'form name prefilled from the account, not the withdrawn registration', file: SECTION, suites,
    edits: [['initialName={current?.fullName || currentUser.name}', 'initialName={currentUser.name}']] },
  { id: 'M17', name: 'contact number not prefilled', file: SECTION, suites,
    edits: [['initialContactNumber={current?.contactNumber || ""}', 'initialContactNumber=""']] },
  { id: 'M18', name: 'first-time confirmation wording used on re-register', file: SECTION, suites,
    edits: [['reregistered={reregistering}', 'reregistered={false}']] },
  { id: 'M19', name: 'footer left visible under the open form', file: SECTION, suites,
    edits: [['hideFooter={formOpen}', 'hideFooter={false}']] },
  { id: 'M20', name: 'card follows the stale prop instead of the store', file: SECTION, suites,
    edits: [['const current = stored ?? registration;', 'const current = registration;']] },
  { id: 'M21', name: 'month names taken from Intl ("Sept")', file: UTIL, suites,
    edits: [['  month: "numeric",', '  month: "short",'], ['${MONTHS[Number(part("month")) - 1]}', '${part("month")}']] },
  { id: 'M26', name: 'dialog: the "focus left the dialog" branch removed', file: DIALOG, suites,
    edits: [['if (!panel.contains(active)) {', 'if (false) {']] },
  { id: 'M27', name: 'dialog: the "no focusable buttons" branch removed', file: DIALOG, suites,
    edits: [['if (items.length === 0) {', 'if (false) {']] },
  { id: 'M28', name: 'footer prints "Closes ..." even with no close time', file: STATUS, suites,
    edits: [['const closesLabel = footer.closesAt\n        ?', 'const closesLabel = true\n        ?']] },
  { id: 'M29', name: 'timeline always renders a Withdrawn entry', file: STATUS, suites,
    edits: [['...(registration.withdrawnAt\n      ?', '...(true\n      ?']] },
  { id: 'M30', name: "footer-state fix reverted: a cancelled event's future close shown as 'closed on'", file: VIEW, suites,
    edits: [['closesAt: hasClosed ? closesAt : undefined', 'closesAt: event.registrationClosesAt']] },
  { id: 'M31', name: 'a 409 on re-register does not reload the registration', file: SECTION, suites,
    edits: [['void loadMyRegistration(event.id)\n                  .then(() => setFormOpen(false))\n                  .catch(() => undefined);', 'setFormOpen(false);']] },
  { id: 'M32', name: 'a 409 leaves the form flagged open', file: SECTION, suites,
    edits: [['.then(() => setFormOpen(false))', '.then(() => undefined)']] },
  { id: 'M33', name: "footer's expected-attendance fallback removed", file: VIEW, suites,
    edits: [['spots: event.availableRegistrationSpots ?? event.expectedAttendance,', 'spots: event.availableRegistrationSpots as number,']] },
  { id: 'M37', name: 'Withdraw hidden for a cancelled event (status label decides)', file: SECTION, suites,
    edits: [['const eventOccurred = hasEventStarted(event, now) || serverSaysOccurred;', 'const eventOccurred = hasEventStarted(event, now) || serverSaysOccurred || event.status === "cancelled";']] },
  { id: 'M38', name: 'the swallowed reload failure after a 409 removed (unhandled rejection)', file: SECTION, suites,
    edits: [['                  .then(() => setFormOpen(false))\n                  .catch(() => undefined);', '                  .then(() => setFormOpen(false));']] },
  { id: 'M39', name: 'Escape cancels the dialog while the withdrawal is still pending', file: DIALOG, suites,
    edits: [['if (!pending) onCancel();', 'onCancel();']] },
  { id: 'M40', name: 'in-flight guard removed: a double activation of Confirm sends two requests', file: SECTION, suites,
    edits: [['if (!current || withdrawInFlight.current) return;', 'if (!current) return;']] },
  { id: 'M41', name: 'a rejection that is not an Error is read as one (TypeError)', file: SECTION, suites,
    edits: [['error instanceof Error ? error.message : "We couldn\'t process your withdrawal. Please try again.",', 'error instanceof Error ? error.message : (error as Error).message,']] },
  { id: 'M42', name: 'every failure assumed to be an ApiError (TypeError for an empty rejection)', file: SECTION, suites,
    edits: [['const code = error instanceof ApiError ? error.code : undefined;', 'const code = (error as ApiError).code;']] },
];
