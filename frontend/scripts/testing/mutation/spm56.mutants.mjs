// SPM-56 booking conflict alert fault injection.
export const SUITES = {
  conflictAlert: {
    args: ['run', 'src/features/bookings/pages/requests/BookingsPage.test.tsx'],
  },
};
const MODAL = 'src/features/bookings/pages/requests/BookingDetailModal.tsx';
const suite = ['conflictAlert'];
export const MUTANTS = [
  { id: 'SPM56-FE-01', name: 'tentative holds are mislabeled as confirmed bookings', file: MODAL, suites: suite, edits: [['conflict.requestKind === "tentative_hold" ? "Active tentative hold" : "Confirmed booking"', 'false ? "Active tentative hold" : "Confirmed booking"']] },
  { id: 'SPM56-FE-02', name: 'unavailable blockers are formatted as event occupied intervals and omit their reason', file: MODAL, suites: suite, edits: [['Unavailable period: {formatSingaporeRange(conflict.occupiedStart, conflict.occupiedEnd)} — {conflict.reason}', 'Unavailable period: {formatSingaporeRange(conflict.start, conflict.end)}']] },
  { id: 'SPM56-FE-03', name: 'conflict alert is no longer fixed at the top of the viewport', file: MODAL, suites: suite, edits: [['fixed inset-x-4 top-4', 'absolute inset-x-4 top-4']] },
  { id: 'SPM56-FE-04', name: 'dismiss action does not clear the conflict alert', file: MODAL, suites: suite, edits: [['onClick={() => {\n              setError("");\n              setConflicts([]);\n            }}', 'onClick={() => {\n              setError(error);\n              setConflicts([]);\n            }}']] },
  { id: 'SPM56-FE-05', name: 'conflict message is hidden when blocker details are unavailable', file: MODAL, suites: suite, edits: [["failure instanceof Error\n          ? failure.message", "failure instanceof ApiError && failure.code === \"BOOKING_SLOT_CONFLICT\"\n          ? \"\"\n          : failure instanceof Error\n            ? failure.message"]] },
];
