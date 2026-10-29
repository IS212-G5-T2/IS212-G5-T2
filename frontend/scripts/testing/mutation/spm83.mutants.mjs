// SPM-83 frontend mutants (reject a request with a clear reason), run by the frontend runner:
//   node scripts/testing/mutation/run.mjs --mutants spm83.mutants.mjs            # every mutant
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// FE-83-01 is the notifications toggle. RF1 to RF4 come from the SPM-150 cycle-01 test review (review/mutation).
export const SUITES = {
  notifications: { args: ['run', 'src/components/notifications/RejectionNotifications.test.tsx'] },
  decision: { args: ['run', 'src/features/events/pages/detail/EventDetailPage.decision.test.tsx', 'src/store/useAppStore.decisions.test.ts', 'src/features/events/pages/list/EventListPage.test.tsx'] },
};

const NOTIFICATIONS = 'src/components/notifications/RejectionNotifications.tsx';
const DETAIL = 'src/features/events/pages/detail/EventDetailPage.tsx';

export const MUTANTS = [{
  id: 'FE-83-01', name: 'Show all continues to display only unread decisions',
  file: NOTIFICATIONS, suites: ['notifications'],
  testMappings: [{ suite: 'notifications', file: 'src/components/notifications/RejectionNotifications.test.tsx', title: 'SPM-83 toggles between unread and all rejection decisions' }],
  edits: [['const visible = expanded ? notifications : unread;', 'const visible = expanded ? unread : unread;']],
}, {
  id: 'RF1', name: 'the page sends a truncated reason (first 499 characters), so a 500-character reason is not sent in full (EVENT-REJECT-01-E)',
  file: DETAIL, suites: ['decision'],
  edits: [['await rejectEvent(event.id, trimmed);', 'await rejectEvent(event.id, trimmed.slice(0, 499));']],
}, {
  id: 'RF2', name: 'the page sends a fixed reason instead of the entered one (EVENT-REJECT-01-B, 01-H)',
  file: DETAIL, suites: ['decision'],
  edits: [['await rejectEvent(event.id, trimmed);', 'await rejectEvent(event.id, "Rejected after coordinator review");']],
}, {
  id: 'RF3', name: 'the Review Event entrypoint is also shown to the owning organiser (EVENT-REJECT-04-A)',
  file: DETAIL, suites: ['decision'],
  edits: [['{isAssignedCoordinator && event.status === "submitted" && (', '{(isAssignedCoordinator || isOwner) && event.status === "submitted" && (']],
}, {
  id: 'RF4', name: 'Submit Decision is not disabled while the decision is in flight, so a second click sends a duplicate (EVENT-REJECT-01-B)',
  file: DETAIL, suites: ['decision'],
  edits: [['disabled={submittingDecision || !reviewDecision}', 'disabled={!reviewDecision}']],
}];
