const FILE = 'src/components/notifications/NotificationItem.tsx';
const TEST = 'src/components/notifications/NotificationItem.test.tsx';

export const SUITES = {
  unit: { args: ['run', TEST, 'src/features/events/pages/detail/planning/PlanningInformationPage.test.tsx', 'src/features/events/pages/safety/SafetyCheckQueuePage.test.tsx'] },
};

export const MUTANTS = [
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
    edits: [['by Safety Officer', 'by coordinator']],
    testMappings: [{ suite: 'unit', file: 'src/features/events/pages/detail/planning/PlanningInformationPage.test.tsx', title: 'SAFETY-OUTCOME-04/05: the coordinator sees safety-specific review markers beside selected arrangements without operational statuses changing' }],
  },
  {
    id: 'S131-FE-03',
    name: 'the Safety Officer cannot persist selected technical arrangements for review (SAFETY-OUTCOME-04)',
    file: 'src/features/events/pages/safety/SafetyCheckQueuePage.tsx',
    suites: ['unit'],
    edits: [['event.target.checked ? [...item.equipmentIds, equipment.id] : item.equipmentIds.filter((id) => id !== equipment.id)', '[]']],
    testMappings: [{ suite: 'unit', file: 'src/features/events/pages/safety/SafetyCheckQueuePage.test.tsx', title: 'SAFETY-OUTCOME-04 submits selected affected arrangements with each change description' }],
  },
];
