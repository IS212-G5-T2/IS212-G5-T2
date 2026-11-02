// SPM-153 frontend mutants (the Mark as Completed action and the completed line). Run by run.mjs:
// `node scripts/testing/mutation/run.mjs --mutants spm153.mutants.mjs`.
// Each edit is [from, to]; `from` must occur exactly once in its file. Each mutant names the test that must go red.
export const SUITES = {
  planning: { args: ['run', 'src/features/events/pages/detail/planning/CompleteEventPanel.test.tsx', 'src/features/events/pages/detail/planning/CompletionRecordForm.test.tsx'] },
};

const PANEL = 'src/features/events/pages/detail/planning/CompleteEventPanel.tsx';
const panelTest = 'src/features/events/pages/detail/planning/CompleteEventPanel.test.tsx';
const FORM = 'src/features/events/pages/detail/planning/CompletionRecordForm.tsx';
const formTest = 'src/features/events/pages/detail/planning/CompletionRecordForm.test.tsx';
const t = (file, title) => ({ suite: 'planning', file, title });

export const MUTANTS = [
  { id: 'FM1', name: 'the button is enabled before the end instant', file: PANEL,
    edits: [['const [ended, setEnded] = useState(() => hasEventEnded(endDateTime));', 'const [ended, setEnded] = useState(() => true);']],
    suites: ['planning'], testMappings: [t(panelTest, 'COMPLETE-EVENT-01-B: shows the reason and disables the button before the event has ended')] },
  { id: 'FM2', name: 'the button does not enable itself at the end instant (no timer)', file: PANEL,
    edits: [['      timer = setTimeout(arm, Math.min(remaining, MAX_TIMER_MS));', '      timer = undefined;']],
    suites: ['planning'], testMappings: [t(panelTest, 'COMPLETE-EVENT-01-C: enables the button at the end instant with no reload')] },
  { id: 'FM4', name: 'a Completed event does not state its completion', file: PANEL,
    edits: [['if (status === "completed" || completedHere)', 'if (completedHere)']],
    suites: ['planning'], testMappings: [t(panelTest, 'COMPLETE-EVENT-01-A: a Completed event states the completion to any viewer and offers no button')] },
  { id: 'FM5', name: 'the action is shown for an event that is not Confirmed', file: PANEL,
    edits: [['const showAction = isAssignedCoordinator && status === "confirmed" && !completedHere;', 'const showAction = isAssignedCoordinator && !completedHere;']],
    suites: ['planning'], testMappings: [t(panelTest, 'COMPLETE-EVENT-02-B: does not render the button for %s')] },
  { id: 'FM6', name: 'the action is shown to a user who is not the assigned coordinator', file: PANEL,
    edits: [['const showAction = isAssignedCoordinator && status === "confirmed" && !completedHere;', 'const showAction = status === "confirmed" && !completedHere;']],
    suites: ['planning'], testMappings: [t(panelTest, 'COMPLETE-EVENT-02-B: does not render the button for %s')] },
  { id: 'FM7', name: 'the edited notes are not sent', file: FORM,
    edits: [['      operationalNotes: notes,', '      operationalNotes: "",']],
    suites: ['planning'], testMappings: [t(formTest, 'COMPLETE-EVENT-05-B: edited notes are sent as entered')] },
  { id: 'FM8', name: 'removing an issue keeps the wrong issue', file: FORM,
    edits: [['setIssues(issues.filter((_, position) => position !== index))', 'setIssues(issues.filter((_, position) => position === index))']],
    suites: ['planning'], testMappings: [t(formTest, 'COMPLETE-EVENT-05-B: removing an issue sends the remaining issues only')] },
  { id: 'FM9', name: 'the form is shown on an event that is not Completed', file: FORM,
    edits: [['const visible = isAssignedCoordinator && status === "completed";', 'const visible = isAssignedCoordinator;']],
    suites: ['planning'], testMappings: [t(formTest, 'COMPLETE-EVENT-05-C: is not rendered for a %s event')] },
  { id: 'FM10', name: 'an attendance that is not a whole number is cleared instead of sent as typed', file: FORM,
    edits: [[': trimmed;', ': null;']],
    suites: ['planning'], testMappings: [t(formTest, 'COMPLETE-EVENT-05-D: an attendance that is not a whole number is sent as typed')] },
  { id: 'FM11', name: 'a failed load shows no error', file: FORM,
    edits: [['setErrorMessage("Completion details could not be loaded.");', 'setErrorMessage("");']],
    suites: ['planning'], testMappings: [t(formTest, 'COMPLETE-EVENT-05-A: a failed load shows an error and leaves the save disabled')] },
  { id: 'FM12', name: 'a load failure for a previous event is applied after the event has changed', file: FORM,
    edits: [['if (!cancelled) setErrorMessage("Completion details could not be loaded.");', 'setErrorMessage("Completion details could not be loaded.");']],
    suites: ['planning'], testMappings: [t(formTest, 'COMPLETE-EVENT-05-A: a failed load for a previous event that arrives late shows no error'), t(formTest, 'COMPLETE-EVENT-05-A: a load that fails after the form is closed is ignored')] },
  { id: 'FM13', name: 'a record for a previous event is applied after the event has changed', file: FORM,
    edits: [['        if (cancelled) return;', '']],
    suites: ['planning'], testMappings: [t(formTest, 'COMPLETE-EVENT-05-A: a load for a previous event that arrives late is ignored')] },
];
