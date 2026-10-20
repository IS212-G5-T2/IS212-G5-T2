// SPM-36 frontend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  create: { args: ['run', 'src/features/events/pages/create/EventCreatePage.test.tsx'] },
};

const PAGE = 'src/features/events/pages/create/EventCreatePage.tsx';

export const MUTANTS = [
  { id: 'FE-36-01', name: 'a description error does not return the organiser to step 0 (EVE-CRE-05-F)', file: PAGE, suites: ['create'],
    edits: [['if (next.name || next.purpose || next.description) setStep(0);', 'if (next.name || next.purpose) setStep(0);']] },
  { id: 'FE-36-02', name: 'a blank name is not reported on submit: the name error is dropped (EVE-CRE-04-A)', file: PAGE, suites: ['create'],
    edits: [['if (!form.name.trim()) next.name', 'if (false) next.name']] },,
  { id: 'FE-36-03', name: 'several rejected fields send the user to the latest step, hiding the earliest rejected field (SPM-36 AC9)', file: PAGE, suites: ['create'],
    edits: [['setStep(Math.min(...rejectedSteps));', 'setStep(Math.max(...rejectedSteps));']] },
  { id: 'FE-36-04', name: 'a rejected attachment is routed to the review step, where the attachment field is not shown (SPM-36 AC9)', file: PAGE, suites: ['create'],
    edits: [['  "attachments",\n];', '];']] },
  { id: 'FE-36-05', name: 'a rejected equipment-needs message is not passed to its input (SPM-36 AC9)', file: PAGE, suites: ['create'],
    edits: [['error={errors.equipmentNeeds}', '']] }
];
