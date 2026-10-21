// SPM-136 frontend mutants (Cancel an Event), run by the frontend runner:
//   node scripts/testing/mutation/run.mjs --mutants spm136.mutants.mjs            # every mutant
//   node scripts/testing/mutation/run.mjs --mutants spm136.mutants.mjs --only F8,F15
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// The runner mutates a scratch copy only and proves the original files untouched.
//
// Covers: canCancelEvent (role, ownership, status), the cancelled banner, the status update after a cancel
// (and the MSG-CN-02 status line that must stay visible), the dialog (Keep, Escape, outside click, pending
// disable, initial focus), and the confirmed: true body.
//
// F4 and F5 are EQUIVALENT (TR-136-06): PLANNING_STATUSES (utils/planning.ts) does not include "cancelled", so
// once the event is cancelled the planning effect clears planningView and neither planning panel renders. The
// `!isCancelled` guards are therefore redundant. The one transient render before the effect runs is not visible.
export const SUITES = {
  spm136: {
    args: [
      'run',
      'src/features/events/lib/cancellation.test.ts',
      'src/features/events/pages/detail/cancel',
      'src/features/events/pages/detail/EventDetailPage.cancel.test.tsx',
      'src/features/events/pages/detail/cancel/CancelEventDialog.test.tsx',
    ],
  },
};

const RULE = 'src/features/events/lib/cancellation.ts';
const PAGE = 'src/features/events/pages/detail/EventDetailPage.tsx';
const DIALOG = 'src/features/events/pages/detail/cancel/CancelEventDialog.tsx';
const API = 'src/features/events/pages/detail/cancel/cancelEvent.ts';
const suites = ['spm136'];

export const MUTANTS = [
  { id: 'F1', name: 'Coordinator Lead offered Cancel Event (01-C F)', file: RULE, suites,
    edits: [['const assigned = currentUser.role === "coordinator" && event.coordinatorId === currentUser.id;', 'const assigned = currentUser.role === "coordinator_lead" || (currentUser.role === "coordinator" && event.coordinatorId === currentUser.id);']] },
  { id: 'F2', name: 'any organiser offered Cancel Event (ownership dropped, 01-C B)', file: RULE, suites,
    edits: [['currentUser.role === "organiser" && event.organiserId === currentUser.id', 'currentUser.role === "organiser"']] },
  { id: 'F3', name: 'approved dropped from the cancellable statuses (03-B)', file: RULE, suites,
    edits: [['["submitted", "approved", "planning", "confirmed"]', '["submitted", "planning", "confirmed"]']] },
  { id: 'F4', name: 'planning information page not hidden on a cancelled event (07-A UI) (equivalent: planningEnabled requires PLANNING_STATUSES, which excludes Cancelled, so planningView is null for a cancelled event)', file: PAGE, suites, equivalent: true,
    edits: [['{planningView && isAssignedCoordinator && !isCancelled && (', '{planningView && isAssignedCoordinator && (']] },
  { id: 'F5', name: 'planning update form not hidden on a cancelled event (07-A UI) (equivalent: planningView is null for a cancelled event, since PLANNING_STATUSES excludes Cancelled)', file: PAGE, suites, equivalent: true,
    edits: [['{planningView && isPlanningCoordinator && !planningView.readOnly && !isCancelled && (', '{planningView && isPlanningCoordinator && !planningView.readOnly && (']] },
  { id: 'F6', name: 'cancelled banner removed (03-A, 07-A)', file: PAGE, suites,
    edits: [['{isCancelled && (\n        <p ref={cancelledBannerRef}', '{false && (\n        <p ref={cancelledBannerRef}']] },
  { id: 'F7', name: 'status not updated after a cancel (03-A page)', file: PAGE, suites,
    edits: [['onCancelled={() => setEventStatus(event.id, "cancelled")}', 'onCancelled={() => undefined}']] },
  { id: 'F15', name: 'dialog unmounted on success, so MSG-CN-02 is never shown (TR-136-02)', file: PAGE, suites,
    edits: [['onCancelled={() => setEventStatus(event.id, "cancelled")}', 'onCancelled={() => { setShowCancel(false); setEventStatus(event.id, "cancelled"); }}']] },
  { id: 'F8', name: 'Keep event also sends the cancel request (M9, 02-B)', file: DIALOG, suites,
    edits: [['onClick={dismiss} disabled={pending}', 'onClick={() => { void handleConfirm(); }} disabled={pending}']] },
  { id: 'F9', name: 'confirm button not disabled while pending (02-A)', file: DIALOG, suites,
    edits: [['disabled={pending} aria-busy={pending}', 'disabled={false} aria-busy={pending}']] },
  { id: 'F11', name: 'Escape does not close (02-B B)', file: DIALOG, suites,
    edits: [['    if (event.key === "Escape") {\n      event.preventDefault();\n      dismiss();', '    if (event.key === "Escape") {\n      event.preventDefault();']] },
  { id: 'F12', name: 'outside click does not close (02-B C)', file: DIALOG, suites,
    edits: [['if (event.target === event.currentTarget) dismiss();', 'if (event.target === event.currentTarget) return;']] },
  { id: 'F13', name: 'initial focus not on Keep event (02-A)', file: DIALOG, suites,
    edits: [['    firstButtonRef.current?.focus();\n  }, []);', '  }, []);']] },
  { id: 'F14', name: 'MSG-CN-02 status line in the dialog removed (02-A)', file: DIALOG, suites,
    edits: [['{successMessage && (', '{false && (']] },
  { id: 'F10', name: 'confirmed flag dropped from the cancel body (02-A)', file: API, suites,
    edits: [['body: JSON.stringify({ targetStatus: "Cancelled", confirmed: true }),', 'body: JSON.stringify({ targetStatus: "Cancelled" }),']] },
  // RR-136-03: a cancelled event offers no clarification Reply or Resolve.
  { id: 'F16', name: 'clarification Reply offered on a cancelled event (RR-136-03)', file: PAGE, suites,
    edits: [['canReply={!isCancelled && (isOwner || isAssignedCoordinator) && event.status !== "confirmed"}', 'canReply={(isOwner || isAssignedCoordinator) && event.status !== "confirmed"}']] },
  { id: 'F17', name: 'clarification Resolve offered on a cancelled event (RR-136-03)', file: PAGE, suites,
    edits: [['canResolve={!isCancelled && (isOwner || isAssignedCoordinator)}', 'canResolve={isOwner || isAssignedCoordinator}']] },
  // CQ F2: the dialog Tab trap follows the currently focusable buttons (after success only Close remains).
  { id: 'F18', name: 'forward Tab trap disabled once only Close remains (CQ F2)', file: DIALOG, suites,
    edits: [['} else if (!event.shiftKey && document.activeElement === last) {', '} else if (!event.shiftKey && focusable.length > 1 && document.activeElement === last) {']] },
  { id: 'F19', name: 'backward Tab trap disabled once only Close remains (CQ F2)', file: DIALOG, suites,
    edits: [['if (event.shiftKey && document.activeElement === first) {', 'if (event.shiftKey && document.activeElement === first && focusable.length > 1) {']] },
  { id: 'F20', name: 'focus not moved to Close after success (CQ F2)', file: DIALOG, suites,
    edits: [['    if (successMessage) firstButtonRef.current?.focus();', '    void successMessage;']] },
  { id: 'F21', name: 'dialog close does not return focus (CQ F2)', file: DIALOG, suites,
    edits: [['      returnFocusRef.current?.()?.focus();', '      void returnFocusRef.current;']] },
  { id: 'F22', name: 'page does not pass the stable return-focus target (CQ F2)', file: PAGE, suites,
    edits: [['          returnFocus={() => cancelledBannerRef.current ?? cancelTriggerRef.current}\n', '']] },
  { id: 'F23', name: 'cancelled banner not focusable for return focus (CQ F2)', file: PAGE, suites,
    edits: [['<p ref={cancelledBannerRef} tabIndex={-1} role="note"', '<p ref={cancelledBannerRef} role="note"']] },
  // TR-136-13: the Shift+Tab wrap from the first control (Keep event) to the last (Confirm cancellation) is inverted.
  { id: 'P2', name: 'Shift+Tab wrap condition uses the non-shift check (TR-136-13, CQ F2 trap)', file: DIALOG, suites,
    testMappings: [{
      suite: 'spm136',
      file: 'src/features/events/pages/detail/cancel/CancelEventDialog.test.tsx',
      title: 'TR-136-13: Shift Tab from Keep event, the first control, wraps to Confirm cancellation and does not leave the dialog',
    }],
    edits: [['if (event.shiftKey && document.activeElement === first) {', 'if (!event.shiftKey && document.activeElement === first) {']] },
  // ---- SPM-136 test-quality pass: the none-identified rows of the cancel rule, page and dialog tests are now killed by a
  // named mutant. Rows of a templated it.each have no single title, so their mutants are killed by the spm136 suite
  // (any failing row); the single-title tests name their kill through testMappings.
  // Rule (cancellation.ts): who is offered Cancel Event, and on which statuses.
  { id: 'F24', name: 'assigned-coordinator branch dropped: only the submitting organiser is offered (01-A FE)', file: RULE, suites,
    edits: [['  return (assigned || submitted) && (CANCELLABLE_EVENT_STATUSES as readonly string[]).includes(event.status);', '  return submitted && (CANCELLABLE_EVENT_STATUSES as readonly string[]).includes(event.status);']],
    testMappings: [{ suite: 'spm136', file: 'src/features/events/lib/cancellation.test.ts', title: 'CANCEL-EVENT-01-A (FE): the assigned coordinator is offered Cancel Event' }] },
  { id: 'F25', name: 'submitting-organiser branch dropped: only the assigned coordinator is offered (01-B FE)', file: RULE, suites,
    edits: [['  return (assigned || submitted) && (CANCELLABLE_EVENT_STATUSES as readonly string[]).includes(event.status);', '  return assigned && (CANCELLABLE_EVENT_STATUSES as readonly string[]).includes(event.status);']],
    testMappings: [{ suite: 'spm136', file: 'src/features/events/lib/cancellation.test.ts', title: 'CANCEL-EVENT-01-B (FE): the submitting organiser is offered Cancel Event' }] },
  { id: 'F26', name: 'assigned-coordinator id check dropped: a coordinator who is not assigned is offered (01-C COO-02 row)', file: RULE, suites,
    edits: [['  const assigned = currentUser.role === "coordinator" && event.coordinatorId === currentUser.id;', '  const assigned = currentUser.role === "coordinator";']] },
  { id: 'F27', name: 'attendee role offered Cancel Event (01-C ATT-01 row)', file: RULE, suites,
    edits: [['  return (assigned || submitted) && (CANCELLABLE_EVENT_STATUSES as readonly string[]).includes(event.status);', '  return (assigned || submitted || currentUser.role === "attendee") && (CANCELLABLE_EVENT_STATUSES as readonly string[]).includes(event.status);']] },
  { id: 'F29', name: 'submitted dropped from the cancellable statuses (03-B submitted row)', file: RULE, suites,
    edits: [['export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning", "confirmed"] as const;', 'export const CANCELLABLE_EVENT_STATUSES = ["approved", "planning", "confirmed"] as const;']] },
  { id: 'F30', name: 'planning dropped from the cancellable statuses (03-B planning row)', file: RULE, suites,
    edits: [['export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning", "confirmed"] as const;', 'export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "confirmed"] as const;']] },
  { id: 'F31', name: 'confirmed dropped from the cancellable statuses (03-B confirmed row)', file: RULE, suites,
    edits: [['export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning", "confirmed"] as const;', 'export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning"] as const;']] },
  { id: 'F32', name: 'deny-list instead of allow-list: a draft event is offered (03-B draft row)', file: RULE, suites,
    edits: [['  return (assigned || submitted) && (CANCELLABLE_EVENT_STATUSES as readonly string[]).includes(event.status);', '  return (assigned || submitted) && !["completed", "rejected", "cancelled"].includes(event.status);']] },
  { id: 'F33', name: 'cancelled added to the cancellable statuses (03-B cancelled row; the page shows the button too)', file: RULE, suites,
    edits: [['export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning", "confirmed"] as const;', 'export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning", "confirmed", "cancelled"] as const;']] },
  { id: 'F34', name: 'completed added to the cancellable statuses (03-B completed row)', file: RULE, suites,
    edits: [['export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning", "confirmed"] as const;', 'export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning", "confirmed", "completed"] as const;']] },
  { id: 'F35', name: 'rejected added to the cancellable statuses (03-B rejected row)', file: RULE, suites,
    edits: [['export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning", "confirmed"] as const;', 'export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning", "confirmed", "rejected"] as const;']] },
  // Dialog (CancelEventDialog.tsx): the refused-cancel alert, the fallback text, and the key handling.
  { id: 'F36', name: 'refused cancel shows no alert: the error line is not rendered (02-A 409 row)', file: DIALOG, suites,
    edits: [['{errorMessage && (', '{false && (']],
    testMappings: [{ suite: 'spm136', file: 'src/features/events/pages/detail/cancel/CancelEventDialog.test.tsx', title: 'CANCEL-EVENT-02-A: a refused cancel (409) is shown as an alert and the dialog stays open' }] },
  { id: 'F37', name: 'fallback text dropped: a failure that is not an Error shows an empty alert (02-A fallback row)', file: DIALOG, suites,
    edits: [['setErrorMessage(error instanceof Error ? error.message : FALLBACK_ERROR);', 'setErrorMessage(error instanceof Error ? error.message : "");']],
    testMappings: [{ suite: 'spm136', file: 'src/features/events/pages/detail/cancel/CancelEventDialog.test.tsx', title: 'CANCEL-EVENT-02-A: a failure that is not an Error is shown with the fallback text and the dialog stays open' }] },
  { id: 'F38', name: 'every key closes the dialog: a letter key dismisses it (02-B letter-key row)', file: DIALOG, suites,
    edits: [['    if (event.key !== "Tab") return;', '    if (event.key !== "Tab") { dismiss(); return; }']],
    testMappings: [{ suite: 'spm136', file: 'src/features/events/pages/detail/cancel/CancelEventDialog.test.tsx', title: 'CANCEL-EVENT-02-B: a letter key does nothing: no close, no request' }] },
  // Page (EventDetailPage.tsx): the Cancel Event button by status, and the clarification Reply on a live Planning event.
  { id: 'F39', name: 'Cancel Event hidden on a Planning event (01-A page row)', file: PAGE, suites,
    edits: [['            {canCancel && (\n              <Button ref={cancelTriggerRef}', '            {canCancel && event.status !== "planning" && (\n              <Button ref={cancelTriggerRef}']],
    testMappings: [{ suite: 'spm136', file: 'src/features/events/pages/detail/EventDetailPage.cancel.test.tsx', title: 'CANCEL-EVENT-01-A (page): the assigned coordinator sees Cancel Event on a Planning event' }] },
  { id: 'F40', name: 'Cancel Event hidden from the organiser on a Confirmed event (01-B page row)', file: PAGE, suites,
    edits: [['            {canCancel && (\n              <Button ref={cancelTriggerRef}', '            {canCancel && !(isOwner && event.status === "confirmed") && (\n              <Button ref={cancelTriggerRef}']],
    testMappings: [{ suite: 'spm136', file: 'src/features/events/pages/detail/EventDetailPage.cancel.test.tsx', title: 'CANCEL-EVENT-01-B (page): the submitting organiser sees Cancel Event on a Confirmed event' }] },
  { id: 'F41', name: 'clarification Reply hidden on a live Planning event (07-A-CLAR control row)', file: PAGE, suites,
    edits: [['canReply={!isCancelled && (isOwner || isAssignedCoordinator) && event.status !== "confirmed"}', 'canReply={!isCancelled && (isOwner || isAssignedCoordinator) && event.status !== "confirmed" && event.status !== "planning"}']],
    testMappings: [{ suite: 'spm136', file: 'src/features/events/pages/detail/EventDetailPage.cancel.test.tsx', title: 'CANCEL-EVENT-07-A-CLAR (control): a live event with the same open clarification offers Reply and Resolve' }] },
  { id: 'D1', name: "Escape does not close the cancel dialog (CANCEL-EVENT-02-B-B)", file: "src/features/events/pages/detail/cancel/CancelEventDialog.tsx", suites: ['spm136'],
    edits: [["if (event.key === \"Escape\") {","if (false) {"]] },
  { id: 'D2', name: "Tab can leave the cancel dialog (CANCEL-EVENT-02-D2, 02-D5, 02-D6)", file: "src/features/events/pages/detail/cancel/CancelEventDialog.tsx", suites: ['spm136'],
    edits: [["if (event.key !== \"Tab\") return;","return;"]] },
  { id: 'D3', name: "a click on the backdrop does not close the cancel dialog (CANCEL-EVENT-02-B-C)", file: "src/features/events/pages/detail/cancel/CancelEventDialog.tsx", suites: ['spm136'],
    edits: [["if (event.target === event.currentTarget) dismiss();","if (false) dismiss();"]] },
  { id: 'D4', name: "the cancel dialog can be dismissed while the request is pending (CANCEL-EVENT-02-D1, 02-D3)", file: "src/features/events/pages/detail/cancel/CancelEventDialog.tsx", suites: ['spm136'],
    edits: [["if (!pending) onClose();","onClose();"]] },
  { id: 'D5', name: "Confirm cancellation stays enabled while the request is pending (CANCEL-EVENT-02-A)", file: "src/features/events/pages/detail/cancel/CancelEventDialog.tsx", suites: ['spm136'],
    edits: [["disabled={pending} aria-busy={pending}>","aria-busy={pending}>"]] },
  { id: 'D6', name: "the dialog does not take initial focus on Keep event (CANCEL-EVENT-02-B)", file: "src/features/events/pages/detail/cancel/CancelEventDialog.tsx", suites: ['spm136'],
    edits: [["    firstButtonRef.current?.focus();\n  }, []);","  }, []);"]] },
];
