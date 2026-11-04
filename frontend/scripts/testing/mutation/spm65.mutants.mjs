// SPM-65 frontend mutants (Review and Approve/Deny a Change Request, Coordinator), run by run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm65.mutants.mjs
//   node scripts/testing/mutation/run.mjs --mutants spm65.mutants.mjs --only V3
// Written under SPM-175 (4 Nov 2026). Each edit is [from, to]; `from` must occur exactly once in the file.
// No mutant is claimed equivalent. The backend mutants are in backend/scripts/mutation/spm65.mutants.mjs.
export const SUITES = {
  spm65: {
    args: [
      'run',
      'src/features/events/pages/change-requests',
      'src/features/events/pages/EventChangeRequestsPage.test.tsx',
      'src/features/events/pages/list/PendingChangeRequests.test.tsx',
      'src/features/events/lib/changeRequests.test.ts',
      'src/features/events/api/change-requests-api.test.ts',
      'src/components/notifications/NotificationItem.test.tsx',
      'src/components/notifications/NotificationBell.test.tsx',
      'src/features/events/pages/list/EventListPage.test.tsx',
      'src/features/events/pages/detail/EventDetailPage.changeRequest.test.tsx',
    ],
  },
};

const REVIEW = 'src/features/events/pages/change-requests/ChangeRequestReview.tsx';
const LIST = 'src/features/events/pages/change-requests/ChangeRequestList.tsx';
const SUMMARY = 'src/features/events/pages/change-requests/ChangeRequestSummary.tsx';
const RECHECK = 'src/features/events/pages/change-requests/RecheckList.tsx';
const AUDIT = 'src/features/events/pages/change-requests/ChangeRequestAuditLog.tsx';
const PENDING = 'src/features/events/pages/list/PendingChangeRequests.tsx';
const RULES = 'src/features/events/lib/changeRequests.ts';
const NOTICE = 'src/components/notifications/NotificationItem.tsx';
const ROW = 'src/components/notifications/NotificationRow.tsx';
const LIST_PAGE = 'src/features/events/pages/list/EventListPage.tsx';
const DETAIL = 'src/features/events/pages/detail/EventDetailPage.tsx';
const s = ['spm65'];

export const MUTANTS = [
  // AC1: pending requests oldest first; unopened requests tagged New and cleared on opening.
  { id: 'V1', name: 'pending requests listed newest first (01-A)', file: RULES,
    edits: [['Date.parse(a.createdAt) - Date.parse(b.createdAt)', 'Date.parse(b.createdAt) - Date.parse(a.createdAt)']], suites: s },
  { id: 'V2', name: 'the New tag is never shown (01-F)', file: PENDING,
    edits: [['{newEventIds.has(request.eventId) && (', '{false && (']], suites: s },
  { id: 'V3', name: 'opening the review does not mark the notice read (01-F)', file: REVIEW,
    edits: [['    markChangeRequestNoticesRead(request.eventId).catch(() => undefined);', '']], suites: s },
  // AC2: what is being changed, per field, with added and removed list values; panel only while pending.
  { id: 'V4', name: 'list changes show only added values (02-C)', file: LIST,
    edits: [['    ...original.filter((value) => !proposed.includes(value)).map((value) => `− ${String(value)}`),\n', '']], suites: s },
  { id: 'V5', name: 'the requested-changes table drops the last requested field (02-B)', file: LIST,
    edits: [['        {request.changes.map((change) => {', '        {request.changes.slice(0, -1).map((change) => {']], suites: s },
  { id: 'V6', name: 'the review panel is offered on decided requests too (02-A, 02-D)', file: LIST,
    edits: [['      {review && request.status === "Pending" && (', '      {review && (']], suites: s },
  { id: 'V7', name: 'the event page shows the review panel to any viewer (02-D)', file: SUMMARY,
    edits: [['const awaitingReview = reviewer && latest.status === "Pending";', 'const awaitingReview = latest.status === "Pending";']], suites: s },
  { id: 'V8', name: 'the event page review panel stays on decided requests (02-D)', file: SUMMARY,
    edits: [['const awaitingReview = reviewer && latest.status === "Pending";', 'const awaitingReview = reviewer;']], suites: s },
  // AC3, AC4: Approve only once the conflict check has loaded.
  { id: 'V9', name: 'Approve Change enabled before the conflict check loads (03-I)', file: REVIEW,
    edits: [['            disabled={!conflicts}\n', '            disabled={false}\n']], suites: s },
  { id: 'V10', name: 'the preview says no conflicts even when there are some (03-A)', file: REVIEW,
    edits: [['  if (!conflicts.hasConflicts)', '  if (true)']], suites: s },
  { id: 'V11', name: 'a preview that settles after the panel closes still updates it (03-SUP-LOAD)', file: REVIEW,
    edits: [['        if (active) setConflicts(loaded);', '        setConflicts(loaded);']], suites: s },
  // AC5: a denial needs a trimmed reason of 10 to 500 characters, checked before sending.
  { id: 'V12', name: 'the client minimum reason length drops by one (05-B)', file: RULES,
    edits: [['  if (trimmed.length < DENIAL_REASON_MIN || trimmed.length > DENIAL_REASON_MAX)', '  if (trimmed.length < DENIAL_REASON_MIN - 1 || trimmed.length > DENIAL_REASON_MAX)']], suites: s },
  { id: 'V13', name: 'a blank denial reason passes the client check (05-B)', file: RULES,
    edits: [['  if (!trimmed) return "Please give a reason for denying this change.";', '']], suites: s },
  { id: 'V14', name: 'the denial is sent despite a reason problem (05-B)', file: REVIEW,
    edits: [['    if (problem) return;', '']], suites: s },
  { id: 'V15', name: 'the server’s reason error is not shown under the field (05-B)', file: REVIEW,
    edits: [['      if (e instanceof ApiError && e.errors?.reason) setReasonError(e.errors.reason);', '      if (false) setReasonError(e.errors.reason);']], suites: s },
  // AC6, AC11: a stale decision reloads the request instead of deciding it.
  { id: 'V16', name: 'a decision refused because the request changed does not reload (12-C)', file: REVIEW,
    edits: [['      if (e instanceof ApiError && e.status === 409 && e.code?.startsWith("change_request_")) onStale();', '']], suites: s },
  // AC9: re-check list progress and per-item state.
  { id: 'V17', name: 're-check progress counts checked items as remaining (09-D)', file: RECHECK,
    edits: [['request.recheck.filter((item) => !item.checkedAt).length', 'request.recheck.length']], suites: s },
  { id: 'V18', name: 'an empty re-check list still renders (09-C)', file: RECHECK,
    edits: [['  if (!request.recheck.length) return null;', '']], suites: s },
  { id: 'V19', name: 'a re-checked item shows the mark button again (09-D)', file: RECHECK,
    edits: [['      {item.checkedAt ? (', '      {false ? (']], suites: s },
  // AC10: the audit log reloads after a decision and ignores late loads.
  { id: 'V20', name: 'the audit log does not reload when the refresh key changes (10-B)', file: AUDIT,
    edits: [['  }, [eventId, refreshKey]);', '  }, [eventId]);']], suites: s },
  { id: 'V21', name: 'a late audit log load still updates the page (10-SUP-LOAD)', file: AUDIT,
    edits: [['        if (active) setEntries(loaded);', '        setEntries(loaded);']], suites: s },
  // AC7: the organiser's decision notice opens the Change Requests page.
  { id: 'V22', name: 'an approval notice opens the event page instead of Change Requests (07-D)', file: NOTICE,
    edits: [['  "change_request_approved",\n  "change_request_denied",\n', '  "change_request_denied",\n']], suites: s },
  { id: 'V23', name: 'a superseded conflict preview failure is still shown (03-SUP-LOAD)', file: REVIEW,
    edits: [['        if (active) setPreviewError(', '        setPreviewError(']], suites: s },
  { id: 'V24', name: 'a superseded audit log failure is still shown (10-SUP-LOAD)', file: AUDIT,
    edits: [['        if (active) setError(e instanceof Error ? e.message : "Could not load the audit log.");', '        setError(e instanceof Error ? e.message : "Could not load the audit log.");']], suites: s },
  // Added under SPM-175 so every SPM-65 test kills at least one measured mutant (G3).
  { id: 'V25', name: 'a denial notice shows its reason in the bell headline (05-D)', file: ROW,
    edits: [['  if (type !== "change_request_denied") return message;', '  return message;']], suites: s },
  { id: 'V26', name: 'an empty audit log shows no message (10-B)', file: AUDIT,
    edits: [['  if (!entries.length) return <p', '  if (false) return <p']], suites: s },
  { id: 'V27', name: 'an audit log load failure is not shown (10-B)', file: AUDIT,
    edits: [['  if (error)\n    return (\n      <p role="alert"', '  if (false)\n    return (\n      <p role="alert"']], suites: s },
  { id: 'V28', name: 'audit outcomes shown in reverse server order (10-B)', file: AUDIT,
    edits: [['      {entries.map((entry) => (', '      {[...entries].reverse().map((entry) => (']], suites: s },
  { id: 'V29', name: 'a closed request does not say why (12-B)', file: LIST,
    edits: [['      {request.status === "Closed" && request.decisionReason && (', '      {false && (']], suites: s },
  { id: 'V30', name: 'an approved request does not note the safety check reset (08-A)', file: LIST,
    edits: [['      {request.status === "Approved" && request.safetyCheckReset && (', '      {false && (']], suites: s },
  { id: 'V31', name: 'a preview with no conflicts says nothing (03-B)', file: REVIEW,
    edits: [['    return <p className="text-success-800 dark:text-success-300">No conflicts with existing bookings or registrations.</p>;', '    return null;']], suites: s },
  { id: 'V32', name: 'a failed preview does not say why (03-I)', file: REVIEW,
    edits: [['<p>{previewError} Approval is unavailable until the conflict check succeeds.</p>', '<p>Approval is unavailable until the conflict check succeeds.</p>']], suites: s },
  { id: 'V33', name: 'the approval step always mentions a safety check reset (04-SUP-UI)', file: REVIEW,
    edits: [['{request.requiresSafetyCheck && " Its safety check will be reset and must be requested again."}', '{" Its safety check will be reset and must be requested again."}']], suites: s },
  { id: 'V34', name: 'the approval step never mentions the safety check reset (04-A)', file: REVIEW,
    edits: [['{request.requiresSafetyCheck && " Its safety check will be reset and must be requested again."}', '{false && " Its safety check will be reset and must be requested again."}']], suites: s },
  { id: 'V35', name: 'the approval step cannot be cancelled (04-SUP-UI)', file: REVIEW,
    edits: [['            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode("idle")}>', '            <Button size="sm" variant="ghost" disabled={busy} onClick={() => undefined}>']], suites: s },
  { id: 'V36', name: 'other refused decisions show no message (06-B)', file: REVIEW,
    edits: [['      else setError(message);\n      setBusy(false);', '      setBusy(false);']], suites: s },
  { id: 'V37', name: 'the denial reason is sent untrimmed (05-A)', file: REVIEW,
    edits: [['reason.trim())).request);', 'reason)).request);']], suites: s },
  { id: 'V38', name: 'the event page shows no confirmation after a decision (06-A)', file: SUMMARY,
    edits: [['    setLatest(request);\n    setConfirmation(message);\n    onDecided?.();', '    setLatest(request);\n    onDecided?.();']], suites: s },
  { id: 'V39', name: 'the event page is not told about the decision (06-A, 07-A)', file: SUMMARY,
    edits: [['    setLatest(request);\n    setConfirmation(message);\n    onDecided?.();', '    setLatest(request);\n    setConfirmation(message);']], suites: s },
  { id: 'V40', name: 'everyone gets the re-check button (09-A read-only)', file: RECHECK,
    edits: [['      ) : onRechecked ? (', '      ) : true ? (']], suites: s },
  { id: 'V41', name: 'marking re-checked sends the wrong arrangement (09-B)', file: RECHECK,
    edits: [['markArrangementRechecked(request.eventId, request.id, item.id)', 'markArrangementRechecked(request.eventId, request.id, "wrong-item")']], suites: s },
  { id: 'V42', name: 'a failed re-check mark shows no message (09-D)', file: RECHECK,
    edits: [['      setError(e instanceof Error ? e.message : "Could not mark this arrangement as re-checked.");', '      setError("");']], suites: s },
  { id: 'V43', name: 'the event page does not reload the event after an approval (07-A)', file: DETAIL,
    edits: [['            refreshEvent();\n            if (planningEnabled) void loadPlanning();', '            if (planningEnabled) void loadPlanning();']], suites: s },
  { id: 'V44', name: 'the coordinator’s pending change requests are not listed (01-A, 01-D, 01-F)', file: LIST_PAGE,
    edits: [['      {isCoordinator && pendingChangeRequests && (', '      {false && (']], suites: s },
  { id: 'V45', name: 'the New tags failure hides the pending list (01-F)', file: LIST_PAGE,
    edits: [['      // Without the notices the list still shows every pending request, just without New tags.\n      .catch(() => undefined);', '      .catch(() => setPendingChangeRequests(null));']], suites: s },
  { id: 'V46', name: 'the pending list names the requester instead of the organiser (01-A)', file: PENDING,
    edits: [['{request.organiserName ?? request.requestedBy} ·{" "}', '{"Someone"} ·{" "}']], suites: s },
  { id: 'V47', name: 'the empty pending list says nothing (01-D)', file: PENDING,
    edits: [['<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No pending change requests.</p>', '<p className="mt-2 text-sm text-gray-500 dark:text-gray-400"></p>']], suites: s },
  { id: 'V48', name: 'a superseded New-tag load overwrites the newer tags after a retry (01-F)', file: LIST_PAGE,
    edits: [['        if (active) setNewChangeRequestEvents(ids);', '        setNewChangeRequestEvents(ids);']], suites: s },
  { id: 'V49', name: 'a superseded pending list overwrites the newer list after a retry (01-F)', file: LIST_PAGE,
    edits: [['        if (active) setPendingChangeRequests(requests);', '        setPendingChangeRequests(requests);']], suites: s },
  { id: 'V50', name: 'list changes are marked the wrong way round (02-C)', file: LIST,
    edits: [['.map((value) => `+ ${String(value)}`),', '.map((value) => `− ${String(value)}`),']], suites: s },
];
