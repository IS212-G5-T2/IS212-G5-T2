// SPM-36 frontend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  create: { args: ['run', 'src/features/events/pages/create/EventCreatePage.test.tsx'] },
  detail: { args: ['run', 'src/features/events/pages/detail/EventDetailPage.test.tsx'] },
  list: { args: ['run', 'src/features/events/pages/list/EventListPage.test.tsx'] },
};

const PAGE = 'src/features/events/pages/create/EventCreatePage.tsx';
const DETAIL = 'src/features/events/pages/detail/EventDetailPage.tsx';
const LIST = 'src/features/events/pages/list/EventListPage.tsx';

export const MUTANTS = [
  { id: 'FE-36-01', name: 'a description error does not return the organiser to step 0 (EVE-CRE-05-F)', file: PAGE, suites: ['create'],
    edits: [['if (next.name || next.purpose || next.description) setStep(0);', 'if (next.name || next.purpose) setStep(0);']] },
  { id: 'FE-36-02', name: 'a blank name is not reported on submit: the name error is dropped (EVE-CRE-04-A)', file: PAGE, suites: ['create'],
    edits: [['if (!form.name.trim()) next.name', 'if (false) next.name']] },
  { id: 'FE-36-03', name: 'several rejected fields send the user to the latest step, hiding the earliest rejected field (SPM-36 AC9)', file: PAGE, suites: ['create'],
    edits: [['setStep(Math.min(...rejectedSteps));', 'setStep(Math.max(...rejectedSteps));']] },
  { id: 'FE-36-04', name: 'a rejected attachment is routed to the review step, where the attachment field is not shown (SPM-36 AC9)', file: PAGE, suites: ['create'],
    edits: [['  "attachments",\n];', '];']] },
  { id: 'FE-36-05', name: 'a rejected equipment-needs message is not passed to its input (SPM-36 AC9)', file: PAGE, suites: ['create'],
    edits: [['error={errors.equipmentNeeds}', '']] },
  { id: 'FE-36-06', name: 'the Back button shows straight after a request is submitted (EVE-CRE-07-C)', file: DETAIL, suites: ['detail'],
    edits: [['{!location.state?.submitted && (', '{true && (']] },
  { id: 'FE-36-07', name: 'the Back button is hidden on a normal open (EVE-CRE-07-D, EVE-CRE-07-E)', file: DETAIL, suites: ['detail'],
    edits: [['{!location.state?.submitted && (', '{false && (']] },
  { id: 'FE-36-08', name: 'a Create Event control on Event Planning leads to My Events, not the Event Request form (EVE-CRE-01-A)', file: LIST, suites: ['list'],
    edits: [['<Link to="/events/create">', '<Link to="/events">']] },
  { id: 'FE-36-09', name: 'My Events hides the organiser\'s submitted events (EVE-CRE-07-B)', file: LIST, suites: ['list'],
    edits: [['    return events;\n  }, [events, currentUser]);', '    return events.filter((e) => e.status !== "submitted");\n  }, [events, currentUser]);']] },
  { id: 'FE-36-10', name: 'the load-error Retry does not load the events again (EVE-CRE-07-F)', file: LIST, suites: ['list'],
    edits: [['<div role="alert">{error} <Button variant="secondary" onClick={() => setRetry(r => r + 1)}>Retry</Button>', '<div role="alert">{error} <Button variant="secondary" onClick={() => undefined}>Retry</Button>']] },
  { id: 'FE-36-11', name: 'a superseded event list load that succeeds later overwrites the newer list (EVE-CRE-07-G)', file: LIST, suites: ['list'],
    edits: [['.then(events => { if (active) useAppStore.setState({ events }); })', '.then(events => { useAppStore.setState({ events }); })']] },
  { id: 'FE-36-12', name: 'a superseded event list load that fails later shows its error (EVE-CRE-07-H)', file: LIST, suites: ['list'],
    edits: [['.catch(e => { if (active) setError(e.message); })', '.catch(e => { setError(e.message); })']] }
];
