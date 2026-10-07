// SPM-46 frontend mutants (View a Reassigned Event), run by run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm46.mutants.mjs
// Each edit is [from, to]; `from` must occur exactly once in the file. IDs match the Confluence
// REASN-VIEW pages and the backend spm46.mutants.mjs (B*). F4 (change-requests link) was removed with the link.
export const SUITES = {
  unit: {
    args: [
      'run',
      'src/components/domain/EventCard.test.tsx',
      'src/components/domain/AssignmentNotifications.test.tsx',
      'src/pages/EventDetailPage.reassignment.test.tsx',
    ],
  },
};

const CARD = 'src/components/domain/EventCard.tsx';
const PAGE = 'src/pages/EventDetailPage.tsx';
const PANEL = 'src/components/domain/AssignmentNotifications.tsx';

export const MUTANTS = [
  { id: 'F1', name: '"Reassigned" label on every card (kills REASN-VIEW-02-F)', file: CARD,
    edits: [['              {event.reassignedFrom && (\n                <span', '              {true && (\n                <span']], suites: ['unit'] },
  { id: 'F2', name: 'reassignment banner shown to everyone, not only the assigned coordinator (kills 02-H)', file: PAGE,
    edits: [['{isAssignedCoordinator && event.reassignedFrom && (\n        <p role="note"', '{event.reassignedFrom && (\n        <p role="note"']], suites: ['unit'] },
  { id: 'F3', name: 'reassignment banner shown without reassignment data (kills 02-H)', file: PAGE,
    edits: [['{isAssignedCoordinator && event.reassignedFrom && (\n        <p role="note"', '{isAssignedCoordinator && (\n        <p role="note"']], suites: ['unit'] },
  { id: 'F5', name: 'notice links to the events list instead of the event (kills 01-B)', file: PANEL,
    edits: [['<Link to={`/events/${notification.relatedEventId}`}', '<Link to={`/events`}']], suites: ['unit'] },
  { id: 'F6', name: 'refusal shown as a generic "Event not found" (kills 04-C)', file: PAGE,
    edits: [['if (loadError) return <div role="alert">{loadError} <Link', 'if (loadError) return <div role="alert">Event not found. <Link']], suites: ['unit'] },
  { id: 'F7', name: 'clarification history not loaded for the coordinator (kills 03-A)', file: PAGE,
    edits: [['(currentUser.role === "coordinator" && event.coordinatorId === currentUser.id);', 'false;']], suites: ['unit'] },
  { id: 'F8', name: 'two event detail fields swapped on the page (kills 03-A)', file: PAGE,
    edits: [['<dd className="font-medium text-gray-800 dark:text-gray-200">{event.expectedAttendance}</dd>', '<dd className="font-medium text-gray-800 dark:text-gray-200">{event.equipmentNeeds}</dd>']], suites: ['unit'] },
];
