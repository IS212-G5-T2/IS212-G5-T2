// SPM-181 frontend mutants: the attendee's "event rescheduled" notice in the top-of-page attendee panel (the type is listed,
// shows the time it was created, opening the event marks it read). Each mutant maps to its EVENT-CHANGE-NOTIF test by ID
// prefix; the runner matches the prefix by name.
const PANEL_TEST = 'src/components/notifications/WaitlistNotifications.test.tsx';
const PANEL = 'src/components/notifications/WaitlistNotifications.tsx';
const panel = (...ids) => ids.map((id) => ({ suite: 'panel', file: PANEL_TEST, title: `EVENT-CHANGE-NOTIF-${id}` }));

export const SUITES = {
  panel: {
    args: ['run', PANEL_TEST],
  },
};

export const MUTANTS = [
  {
    id: 'SPM181-FE-01',
    name: 'the attendee panel does not list the rescheduled type',
    file: PANEL,
    suites: ['panel'],
    testMappings: panel('06-E', '06-F', '06-G'),
    edits: [['["WaitlistPromoted", "EventCancelled", "EventRescheduled"]', '["WaitlistPromoted", "EventCancelled"]']],
  },
  {
    id: 'SPM181-FE-02',
    name: 'following View Event does not mark the notice read',
    file: PANEL,
    suites: ['panel'],
    testMappings: panel('06-F'),
    edits: [['\n                  onClick={() => void markRead(n.id)}', '']],
  },
  {
    id: 'SPM181-FE-03',
    name: 'the notice time is not rendered',
    file: PANEL,
    suites: ['panel'],
    testMappings: panel('06-E'),
    edits: [['{timeAgo(n.createdAt)}', '{""}']],
  },
  {
    id: 'SPM181-FE-04',
    name: 'View Event marks the first notice read instead of its own',
    file: PANEL,
    suites: ['panel'],
    testMappings: panel('06-F'),
    edits: [['to={`/events/${n.relatedEventId}`}\n                  onClick={() => void markRead(n.id)}', 'to={`/events/${n.relatedEventId}`}\n                  onClick={() => void markRead(unread[0].id)}']],
  },
  {
    id: 'SPM181-FE-05',
    name: 'View Event marks only a rescheduled notice read',
    file: PANEL,
    suites: ['panel'],
    testMappings: panel('06-F'),
    edits: [['to={`/events/${n.relatedEventId}`}\n                  onClick={() => void markRead(n.id)}', 'to={`/events/${n.relatedEventId}`}\n                  onClick={() => void (n.type === "EventRescheduled" && markRead(n.id))}']],
  },
  {
    id: 'SPM181-FE-06',
    name: 'the time is shown for a rescheduled notice only',
    file: PANEL,
    suites: ['panel'],
    testMappings: panel('06-E'),
    edits: [['{timeAgo(n.createdAt)}', '{n.type === "EventRescheduled" ? timeAgo(n.createdAt) : ""}']],
  },
];
