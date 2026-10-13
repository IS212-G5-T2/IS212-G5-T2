// SPM-135 frontend mutants (Confirm an Event), run by run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm135.mutants.mjs
//   node scripts/testing/mutation/run.mjs --mutants spm135.mutants.mjs --only FM1,FM6
// Each edit is [from, to]; `from` must occur exactly once in the file at the time it is applied
// (the runner reports MISAPPLIED otherwise). The runner mutates a scratch copy of this frontend
// component and restores it; the original files are never edited (the runner hashes them).
// FM1 to FM10 are the findings named in TR-10. X1 to X9 are extra mutants for the TR-13 branches.
export const SUITES = {
  // The SPM-135 frontend specs: the confirm panel, the confirmed-arrangements panel, the client helpers and the page.
  spm135: {
    args: [
      'run',
      'src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx',
      'src/features/events/pages/detail/planning/ConfirmedArrangementsPanel.test.tsx',
      'src/features/events/pages/detail/EventDetailPage.confirm.test.tsx',
      'src/utils/arrangements.test.ts',
    ],
  },
};

const PANEL = 'src/features/events/pages/detail/planning/ConfirmEventPanel.tsx';
const ARRANGED = 'src/features/events/pages/detail/planning/ConfirmedArrangementsPanel.tsx';
const PAGE = 'src/features/events/pages/detail/EventDetailPage.tsx';
const HELPERS = 'src/utils/arrangements.ts';
const suites = ['spm135'];

export const MUTANTS = [
  // FM1 (M19): the button is no longer disabled while a confirm is in flight. Killer: ConfirmEventPanel 04-B (C).
  { id: 'FM1', name: 'confirm button not disabled while pending (M19)', file: PANEL, suites,
    edits: [['disabled={pending || !loaded || reasons.length > 0} aria-busy={pending}', 'aria-busy={pending}']] },
  // FM2: the page shows the panel to any coordinator (COO-02 included). Killer: EventDetailPage.confirm 01-C (COO-02).
  { id: 'FM2', name: 'page shows the confirm panel to every coordinator', file: PAGE, suites,
    edits: [
      ['(isPlanningOwner || isPlanningCoordinator);', '(isPlanningOwner || isPlanningCoordinator || hasRole(currentUser, "coordinator"));'],
      ['{planningView && isAssignedCoordinator && (\n        <PlanningInformationPage', '{planningView && currentUser.role === "coordinator" && (\n        <PlanningInformationPage'],
    ] },
  // FM3: the Coordinator Lead is allowed to see the panel. Killer: EventDetailPage.confirm 01-C (Lead).
  { id: 'FM3', name: 'coordinator_lead allowed to see the confirm panel', file: PAGE, suites,
    edits: [
      ['(isPlanningOwner || isPlanningCoordinator);', '(isPlanningOwner || isPlanningCoordinator || hasRole(currentUser, "coordinator_lead"));'],
      ['{planningView && isAssignedCoordinator && (\n        <PlanningInformationPage', '{planningView && (isAssignedCoordinator || hasRole(currentUser, "coordinator_lead")) && (\n        <PlanningInformationPage'],
    ] },
  // FM4: the page no longer updates the store after a confirm. Killer: EventDetailPage.confirm 04-A (page).
  { id: 'FM4', name: 'setEventStatus removed from onConfirmed', file: PAGE, suites,
    edits: [['onConfirmed={() => setEventStatus(event.id, "confirmed")}', 'onConfirmed={() => undefined}']] },
  // FM5: the organiser panel is shown without the Confirmed status. Killer: EventDetailPage.confirm 05-B (Planning).
  { id: 'FM5', name: 'organiser arrangements panel shown without status confirmed', file: PAGE, suites,
    edits: [['{isOwner && event.status === "confirmed" && event.organiserId === currentUser.id && (', '{isOwner && event.organiserId === currentUser.id && (']] },
  // FM6: the blocked path no longer refreshes the outstanding list. Killer: ConfirmEventPanel 02-D.
  { id: 'FM6', name: 'outstanding list not refreshed on the blocked path', file: PANEL, suites,
    edits: [['await refreshOutstanding();', 'void 0;']] },
  // FM7: the Planning condition dropped from the visibility rule. Killer: ConfirmEventPanel 06 (rejected, cancelled, confirmed).
  { id: 'FM7', name: 'Planning condition dropped from visible', file: PANEL, suites,
    edits: [['const visible = isAssignedCoordinator && (planning || successMessage !== "");', 'const visible = isAssignedCoordinator;']] },
  // FM8: the outstanding item wording changed. Killers: ConfirmEventPanel 03-A and 03-C (FE).
  { id: 'FM8', name: 'outstandingText format changed', file: HELPERS, suites,
    edits: [['return `${item.label}: ${item.detail}`;', 'return `${item.label} - ${item.detail}`;']] },
  // FM9: onConfirmed is not called after a success. Killer: ConfirmEventPanel 01-A (FE).
  { id: 'FM9', name: 'onConfirmed not called after success', file: PANEL, suites,
    edits: [['      onConfirmed();', '      void onConfirmed;']] },
  // FM9b: the success message is dropped (an empty-looking announcement). Killer: ConfirmEventPanel 01-A (FE).
  { id: 'FM9b', name: 'success message dropped', file: PANEL, suites,
    edits: [['setSuccessMessage(result.message);', 'setSuccessMessage(" ");']] },
  // FM10: the confirmed slot is shown as UTC wall-clock time with the SGT label. Killer: ConfirmedArrangementsPanel 05-B (FE).
  { id: 'FM10', name: 'slot shown in UTC instead of SGT', file: ARRANGED, suites,
    edits: [['const from = sgtDateTimeParts(start);\n  const to = sgtDateTimeParts(end);',
      'const from = sgtDateTimeParts(new Date(new Date(start).getTime() - 8 * 3600 * 1000));\n  const to = sgtDateTimeParts(new Date(new Date(end).getTime() - 8 * 3600 * 1000));']] },
  // X1 (TR-13): the re-entrancy guard is removed. Killer: ConfirmEventPanel re-entrancy test.
  { id: 'X1', name: 'confirm re-entrancy guard removed', file: PANEL, suites,
    edits: [['    if (pending) return;\n', '']] },
  // X2 (TR-13): every failure is treated as a blocked answer. Killer: ConfirmEventPanel 409 test.
  { id: 'X2', name: 'a 409 treated as CONFIRM_BLOCKED', file: PANEL, suites,
    edits: [['if (error instanceof ApiError && error.code === "CONFIRM_BLOCKED") {', 'if (true) {']] },
  // X3 (TR-13): the error alert is not rendered. Killers: ConfirmEventPanel 409 and non-Error tests.
  { id: 'X3', name: 'error alert not rendered', file: PANEL, suites,
    edits: [['{errorMessage && (', '{false && (']] },
  // X4 (TR-13): the non-Error fallback text is lost. Killer: ConfirmEventPanel non-Error test.
  { id: 'X4', name: 'confirm non-Error fallback text removed', file: PANEL, suites,
    edits: [['error instanceof Error ? error.message : "Could not confirm the event."', 'error instanceof Error ? error.message : ""']] },
  // X5 (TR-13): a readiness answer for the previous event is applied. Killer: ConfirmEventPanel stale-response test.
  { id: 'X5', name: 'stale readiness answer applied (confirm panel)', file: PANEL, suites,
    edits: [['if (!cancelled) {\n          setOutstanding(view.outstanding);', '{\n          setOutstanding(view.outstanding);']] },
  // X6 (TR-13): a readiness failure is not handled. Killer: ConfirmEventPanel load test (unhandled rejection fails the run).
  { id: 'X6', name: 'readiness failure on load unhandled', file: PANEL, suites,
    edits: [['      .catch(() => undefined);', '      .catch((e) => { throw e; });']] },
  // X7 (TR-13): a stale arrangements answer is applied. Killer: ConfirmedArrangementsPanel stale-response test.
  { id: 'X7', name: 'stale arrangements answer applied', file: ARRANGED, suites,
    edits: [['if (!cancelled) setView(result);', 'setView(result);']] },
  // X8 (TR-13): a stale failure is applied. Killer: ConfirmedArrangementsPanel stale-error test.
  { id: 'X8', name: 'stale arrangements failure applied', file: ARRANGED, suites,
    edits: [['if (!cancelled) setError(', 'setError(']] },
  // X9 (TR-13): the non-Error fallback text is lost. Killer: ConfirmedArrangementsPanel fallback test.
  { id: 'X9', name: 'arrangements non-Error fallback text removed', file: ARRANGED, suites,
    edits: [['e instanceof Error ? e.message : "Could not load confirmed arrangements."', 'e instanceof Error ? e.message : ""']] },
  // X10 (TR-13): a malformed readiness answer is accepted. Killer: arrangements helper test.
  { id: 'X10', name: 'malformed readiness answer accepted', file: HELPERS, suites,
    edits: [['if (!isArrangementsStatus(view)) throw', 'if (false) throw']] },
];
