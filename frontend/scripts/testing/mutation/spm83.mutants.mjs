export const SUITES = {
  notifications: { args: ['run', 'src/components/notifications/RejectionNotifications.test.tsx'] },
};

export const MUTANTS = [{
  id: 'FE-83-01', name: 'Show all continues to display only unread decisions',
  file: 'src/components/notifications/RejectionNotifications.tsx', suites: ['notifications'],
  testMappings: [{ suite: 'notifications', file: 'src/components/notifications/RejectionNotifications.test.tsx', title: 'SPM-83 toggles between unread and all rejection decisions' }],
  edits: [['const visible = expanded ? notifications : unread;', 'const visible = expanded ? unread : unread;']],
}];
