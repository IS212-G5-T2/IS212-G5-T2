// SPM-33 and SPM-34 frontend mutants (AC2: after sign-in, Venue Staff and Technical Support land on the Events Dashboard),
// run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// The runner mutates a scratch copy only.

export const SUITES = {
  app: { args: ['run', 'src/app/App.test.tsx'] },
};

const NAV = 'src/components/layout/navConfig.ts';
const APP = 'src/app/App.tsx';

export const MUTANTS = [
  { id: 'FE-33-01', name: 'Venue Staff sign-in lands on Venue Records, not the Events Dashboard (SPM-33 AC2)', file: NAV, suites: ['app'],
    edits: [['venue_staff: "/events",', 'venue_staff: "/venue-records",']] },
  { id: 'FE-34-01', name: 'Technical Support sign-in lands on the equipment queue, not the Events Dashboard (SPM-34 AC2)', file: NAV, suites: ['app'],
    edits: [['tech_support: "/events",', 'tech_support: "/equipment/requests",']] },
  { id: 'FE-34-02', name: 'the Events Dashboard route refuses Technical Support, so its sign-in cannot reach it (SPM-34 AC2)', file: APP, suites: ['app'],
    edits: [['"attendee", "venue_staff", "tech_support"]} />}>', '"attendee", "venue_staff"]} />}>']] },
];
