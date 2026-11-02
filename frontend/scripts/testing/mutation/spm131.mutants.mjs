const FILE = 'src/components/notifications/NotificationItem.tsx';
const TEST = 'src/components/notifications/NotificationItem.test.tsx';

export const SUITES = {
  unit: { args: ['run', TEST, 'src/features/events/pages/detail/EventDetailPage.test.tsx', 'src/features/events/pages/detail/planning/PlanningInformationPage.test.tsx', 'src/features/events/pages/detail/planning/SafetyCheckChangesNeeded.test.tsx', 'src/features/events/pages/safety/SafetyCheckQueuePage.test.tsx', 'src/components/notifications/NotificationBell.test.tsx'] },
};

export const MUTANTS = [
  {
    id: 'S131-FE-04',
    name: 'the coordinator notification bell filters out safety outcome notifications (SAFETY-OUTCOME-01)',
    file: 'src/components/notifications/NotificationBell.tsx',
    suites: ['unit'],
    edits: [['  "coordinator_safety_response",\n', '']],
    testMappings: [{ suite: 'unit', file: 'src/components/notifications/NotificationBell.test.tsx', title: 'SAFETY-OUTCOME-01 shows the safety response in the coordinator notification bell' }],
  },
  {
    id: 'S131-FE-01',
    name: 'the safety-response notification uses an unrelated icon (SAFETY-OUTCOME-01)',
    file: FILE,
    suites: ['unit'],
    edits: [['coordinator_safety_response: "🦺"', 'coordinator_safety_response: "🔔"']],
    testMappings: [{ suite: 'unit', file: TEST, title: 'SAFETY-OUTCOME-01 opens the event from a safety response notification' }],
  },
  {
    id: 'S131-FE-02',
    name: 'the coordinator planning page hides safety review markers (SAFETY-OUTCOME-04/05)',
    file: 'src/features/events/pages/detail/planning/PlanningInformationPage.tsx',
    suites: ['unit'],
    edits: [['label: item.venueName,\n          status: item.status,\n          safetyReviewStatus: item.safetyReviewStatus,', 'label: item.venueName,\n          status: item.status,']],
    testMappings: [{ suite: 'unit', file: 'src/features/events/pages/detail/planning/PlanningInformationPage.test.tsx', title: 'shows selected safety changes as pending while retaining feedback' }],
  },
  {
    id: 'S131-FE-03',
    name: 'the Safety Officer cannot persist selected technical arrangements for review (SAFETY-OUTCOME-04)',
    file: 'src/features/events/pages/safety/SafetyCheckQueuePage.tsx',
    suites: ['unit'],
    edits: [['event.target.checked ? [...item.equipmentIds, equipment.id] : item.equipmentIds.filter((id) => id !== equipment.id)', '[]']],
    testMappings: [{ suite: 'unit', file: 'src/features/events/pages/safety/SafetyCheckQueuePage.test.tsx', title: 'SAFETY-OUTCOME-04 submits selected affected arrangements with each change description' }],
  },
  {
    id: 'S131-FE-05',
    name: 'the planning page enables safety requests while registration has unsaved changes (SAFETY-OUTCOME-06)',
    file: 'src/features/events/pages/detail/planning/PlanningInformationPage.tsx',
    suites: ['unit'],
    edits: [['const safetyCanRequest = !!checklist?.canRequestSafetyCheck && !registrationDraftPending;', 'const safetyCanRequest = !!checklist?.canRequestSafetyCheck;']],
    testMappings: [{ suite: 'unit', file: 'src/features/events/pages/detail/planning/PlanningInformationPage.test.tsx', title: 'blocks on an unsaved registration draft and enables safety only after valid settings save' }],
  },
  {
    id: 'S131-FE-06',
    name: 'coordinator safety feedback omits the selected venue and equipment labels (SAFETY-OUTCOME-04/05)',
    file: 'src/features/events/pages/detail/planning/SafetyCheckChangesNeeded.tsx',
    suites: ['unit'],
    edits: [
      ['`Venue: ${venue.venueName}`', '`Venue: Venue`'],
      ['`Equipment: ${entry.name}`', '`Equipment: Equipment`'],
    ],
    testMappings: [{ suite: 'unit', file: 'src/features/events/pages/detail/planning/SafetyCheckChangesNeeded.test.tsx', title: 'shows the selected venue and equipment names beside their own feedback and omits unknown IDs' }],
  },
  {
    id: 'S131-FE-07',
    name: 'event detail never passes unsaved registration changes to the safety request gate (SAFETY-OUTCOME-06)',
    file: 'src/features/events/pages/detail/EventDetailPage.tsx',
    suites: ['unit'],
    edits: [['onDraftStateChange={reportRegistrationDraft}', 'onDraftStateChange={() => {}}']],
    testMappings: [{ suite: 'unit', file: 'src/features/events/pages/detail/EventDetailPage.test.tsx', title: 'SAFETY-OUTCOME-06 connects registration drafts to the event safety request gate' }],
  },
];
